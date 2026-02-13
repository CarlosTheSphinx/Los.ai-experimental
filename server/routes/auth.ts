import type { Express, Request, Response } from 'express';
import type { AuthRequest } from '../auth';
import type { RouteDeps } from './types';
import { OAuth2Client } from 'google-auth-library';
import { eq } from 'drizzle-orm';
import { users } from '@shared/schema';
import {
  hashPassword,
  comparePassword,
  generateToken,
  generateRandomToken,
  setAuthCookie,
  clearAuthCookie,
  encryptToken
} from '../auth';
import { sendPasswordResetEmail } from '../email';

export function registerAuthRoutes(app: Express, deps: RouteDeps) {
  const { storage, db } = deps;

  // ==================== ADDRESS AUTOCOMPLETE (PUBLIC) ====================

  app.get('/api/address/autocomplete', async (req: Request, res: Response) => {
    try {
      const { text } = req.query;

      if (!text || typeof text !== 'string' || text.length < 3) {
        return res.json({ features: [] });
      }

      const apiKey = process.env.GEOAPIFY_API_KEY;
      if (!apiKey) {
        console.error('GEOAPIFY_API_KEY not configured');
        return res.status(500).json({ error: 'Address service not configured' });
      }

      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&filter=countrycode:us&format=json&apiKey=${apiKey}`
      );

      if (!response.ok) {
        throw new Error('Geoapify API error');
      }

      const data = await response.json();

      // Transform to match expected format
      const features = (data.results || []).map((result: any) => ({
        formatted: result.formatted,
        properties: {
          formatted: result.formatted,
          address_line1: result.address_line1,
          address_line2: result.address_line2,
          city: result.city,
          state: result.state,
          postcode: result.postcode,
          country: result.country,
        }
      }));

      res.json({ features });
    } catch (error) {
      console.error('Address autocomplete error:', error);
      res.status(500).json({ error: 'Failed to fetch address suggestions' });
    }
  });

  // ==================== AUTH ROUTES (PUBLIC) ====================

  // One-time admin setup endpoint for production
  // SECURITY: Secret must come from env var, not hardcoded
  app.post('/api/setup-admins', async (req: Request, res: Response) => {
    try {
      const setupSecret = process.env.ADMIN_SETUP_SECRET;
      if (!setupSecret) {
        return res.status(503).json({ error: 'Admin setup is disabled. Set ADMIN_SETUP_SECRET env var to enable.' });
      }
      const secretKey = req.body.secret;
      if (!secretKey || secretKey !== setupSecret) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Generate fresh password hash from env var instead of hardcoding
      const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD;
      if (!adminPassword) {
        return res.status(503).json({ error: 'ADMIN_DEFAULT_PASSWORD env var must be set.' });
      }
      const passwordHash = await hashPassword(adminPassword);

      // Update or create lance@sphinxcap.com
      const lance = await storage.getUserByEmail('lance@sphinxcap.com');
      if (lance) {
        await db.update(users).set({ role: 'admin', passwordHash }).where(eq(users.email, 'lance@sphinxcap.com'));
      } else {
        await db.insert(users).values({
          email: 'lance@sphinxcap.com',
          passwordHash,
          fullName: 'Lance',
          role: 'admin'
        });
      }

      // Update or create carlos@sphinxcap.com
      const carlos = await storage.getUserByEmail('carlos@sphinxcap.com');
      if (carlos) {
        await db.update(users).set({ role: 'admin', passwordHash }).where(eq(users.email, 'carlos@sphinxcap.com'));
      } else {
        await db.insert(users).values({
          email: 'carlos@sphinxcap.com',
          passwordHash,
          fullName: 'Carlos',
          role: 'admin'
        });
      }

      res.json({ success: true, message: 'Admin accounts created/updated' });
    } catch (error) {
      console.error('Admin setup error:', error);
      res.status(500).json({ error: 'Failed to setup admin accounts' });
    }
  });

  // Register
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { email, password, fullName, firstName, lastName, companyName, phone, userType } = req.body;

      // Support both fullName and firstName/lastName
      const resolvedFullName = fullName || (firstName && lastName ? `${firstName} ${lastName}` : null);

      if (!email || !password || !resolvedFullName) {
        return res.status(400).json({ error: 'Email, password, and name are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      // Password strength requirements
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
      if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
        return res.status(400).json({
          error: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
        });
      }

      // Validate userType - default to broker if not provided
      const validUserType = (userType === 'broker' || userType === 'borrower' || userType === 'lender') ? userType : 'broker';

      const existingUser = await storage.getUserByEmail(email.toLowerCase());
      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await hashPassword(password);

      // Borrowers don't need onboarding, brokers and lenders do
      const onboardingCompleted = validUserType === 'borrower';

      // Lenders get admin role by default
      const userRole = validUserType === 'lender' ? 'admin' : 'user';

      const user = await storage.createUser({
        email: email.toLowerCase(),
        passwordHash,
        fullName: resolvedFullName,
        companyName: companyName || null,
        phone: phone || null,
        role: userRole,
        emailVerified: false,
        isActive: true,
        passwordResetToken: null,
        passwordResetExpires: null,
        userType: validUserType,
        onboardingCompleted
      });

      const token = generateToken(user.id, user.email);
      setAuthCookie(res, token);

      // Parse firstName and lastName from fullName for response
      const respNameParts = user.fullName?.split(' ') || [];
      const respFirstName = respNameParts[0] || '';
      const respLastName = respNameParts.slice(1).join(' ') || '';

      res.status(201).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: respFirstName,
          lastName: respLastName,
          fullName: user.fullName,
          companyName: user.companyName,
          userType: user.userType,
          onboardingCompleted: user.onboardingCompleted
        },
        token
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // Login
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await storage.getUserByEmail(email.toLowerCase());

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: 'Account has been deactivated' });
      }

      if (!user.passwordHash) {
        return res.status(401).json({ error: 'This account uses Google login. Please sign in with Google.' });
      }

      const isValid = await comparePassword(password, user.passwordHash);

      if (!isValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      await storage.updateUser(user.id, { lastLoginAt: new Date() });

      const token = generateToken(user.id, user.email);
      setAuthCookie(res, token);

      // Parse firstName and lastName from fullName
      const nameParts = user.fullName?.split(' ') || [];
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName,
          lastName,
          fullName: user.fullName,
          companyName: user.companyName
        },
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Logout
  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    clearAuthCookie(res);
    res.json({ success: true, message: 'Logged out successfully' });
  });

  function getOAuthBaseUrl(req: Request): string {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || req.get('host') || '';
    if (host) {
      return `${proto}://${host}`;
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    }
    return `https://${host}`;
  }

  // Google OAuth - initiate flow
  app.get('/api/auth/google', (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('Google OAuth: GOOGLE_CLIENT_ID not configured');
      return res.redirect('/login?error=google_not_configured');
    }

    const baseUrl = getOAuthBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/google/callback`;
    console.log('Google OAuth: Initiating flow with redirect URI:', redirectUri);
    console.log('Google OAuth: Request host:', req.get('host'), 'x-forwarded-host:', req.headers['x-forwarded-host'], 'x-forwarded-proto:', req.headers['x-forwarded-proto']);
    const googleOAuth = new OAuth2Client(clientId, process.env.GOOGLE_CLIENT_SECRET, redirectUri);

    const authorizeUrl = googleOAuth.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/drive.file',
      ],
      prompt: 'consent',
    });

    res.redirect(authorizeUrl);
  });

  // Google OAuth - callback handler
  app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    console.log('Google OAuth callback hit. Query params:', JSON.stringify(req.query));
    try {
      const { code } = req.query;
      if (!code || typeof code !== 'string') {
        console.error('Google OAuth callback: No code provided. Query:', JSON.stringify(req.query));
        return res.redirect('/login?error=google_auth_failed');
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.redirect('/login?error=google_not_configured');
      }

      const baseUrl = getOAuthBaseUrl(req);
      const redirectUri = `${baseUrl}/api/auth/google/callback`;
      console.log('Google OAuth callback: Using redirect URI for token exchange');
      const googleOAuth = new OAuth2Client(clientId, clientSecret, redirectUri);

      console.log('Google OAuth callback: Exchanging code for tokens...');
      const { tokens } = await googleOAuth.getToken(code);
      console.log('Google OAuth callback: Token exchange successful, verifying id_token...');
      googleOAuth.setCredentials(tokens);

      const ticket = await googleOAuth.verifyIdToken({
        idToken: tokens.id_token!,
        audience: clientId,
      });
      console.log('Google OAuth callback: id_token verified successfully');

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        return res.redirect('/login?error=google_auth_failed');
      }

      const googleId = payload.sub;
      const email = payload.email.toLowerCase();
      const fullName = payload.name || email.split('@')[0];
      const avatarUrl = payload.picture || null;

      let user = await storage.getUserByEmail(email);

      const tokenUpdates: Record<string, unknown> = {};
      if (tokens.refresh_token) {
        tokenUpdates.googleRefreshToken = encryptToken(tokens.refresh_token);
      }
      if (tokens.access_token) {
        tokenUpdates.googleAccessToken = encryptToken(tokens.access_token);
      }
      if (tokens.expiry_date) {
        tokenUpdates.googleTokenExpiresAt = new Date(tokens.expiry_date);
      }

      if (user) {
        if (!user.googleId) {
          await storage.updateUser(user.id, { googleId, avatarUrl: avatarUrl || user.avatarUrl, ...tokenUpdates });
        } else {
          await storage.updateUser(user.id, { ...tokenUpdates });
        }
        if (!user.isActive) {
          return res.redirect('/login?error=account_deactivated');
        }
        await storage.updateUser(user.id, { lastLoginAt: new Date(), emailVerified: true });
      } else {
        user = await storage.createUser({
          email,
          passwordHash: null,
          fullName,
          googleId,
          avatarUrl,
          emailVerified: true,
          isActive: true,
          userType: null,
          onboardingCompleted: false,
          companyName: null,
          phone: null,
          passwordResetToken: null,
          passwordResetExpires: null,
        });
      }

      const token = generateToken(user.id, user.email);
      setAuthCookie(res, token);

      if (!user.userType) {
        res.redirect('/select-role');
      } else {
        res.redirect('/');
      }
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect('/login?error=google_auth_failed');
    }
  });

  // Get current user
  app.get('/api/auth/me', deps.authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.user!.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Parse firstName and lastName from fullName
      const nameParts = user.fullName?.split(' ') || [];
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName,
          lastName,
          fullName: user.fullName,
          companyName: user.companyName,
          phone: user.phone,
          role: user.role,
          userType: user.userType,
          onboardingCompleted: user.onboardingCompleted,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  // Select user type (for Google OAuth users who haven't chosen yet)
  app.post('/api/auth/select-user-type', deps.authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const { userType } = req.body;
      if (userType !== 'broker' && userType !== 'borrower') {
        return res.status(400).json({ error: 'Invalid user type. Must be broker or borrower.' });
      }
      const user = await storage.getUserById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (user.userType) {
        return res.status(400).json({ error: 'User type already set' });
      }
      await storage.updateUser(user.id, { userType });
      const updatedUser = await storage.getUserById(user.id);
      res.json({ success: true, user: updatedUser });
    } catch (error) {
      console.error('Select user type error:', error);
      res.status(500).json({ error: 'Failed to update user type' });
    }
  });

  // Forgot password
  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      const user = await storage.getUserByEmail(email?.toLowerCase());

      if (!user) {
        return res.json({ success: true, message: 'If email exists, reset link sent' });
      }

      const resetToken = generateRandomToken();
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour

      await storage.updateUser(user.id, {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires
      });

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      await sendPasswordResetEmail(user.email, user.fullName || 'User', resetUrl);

      res.json({ success: true, message: 'Password reset email sent' });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  });

  // Reset password
  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ error: 'Token and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      // Password strength requirements (same as registration)
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      const hasNum = /[0-9]/.test(password);
      const hasSpec = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
      if (!hasUpper || !hasLower || !hasNum || !hasSpec) {
        return res.status(400).json({
          error: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
        });
      }

      const user = await storage.getUserByResetToken(token);

      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const passwordHash = await hashPassword(password);

      await storage.updateUser(user.id, {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null
      });

      res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });
}

import type { Express, Request, Response } from 'express';
import type { AuthRequest } from '../auth';
import type { RouteDeps } from './types';
import { OAuth2Client } from 'google-auth-library';
import { eq } from 'drizzle-orm';
import { users, auditLogs, loginAttempts } from '@shared/schema';
import {
  hashPassword,
  comparePassword,
  generateToken,
  generateRandomToken,
  setAuthCookie,
  clearAuthCookie,
  encryptToken,
  verifyToken
} from '../auth';
import { sendPasswordResetEmail, sendBrokerWelcomeEmail } from '../email';
import {
  isAccountLocked,
  calculateLockoutUntil,
  PASSWORD_POLICY,
  validatePassword,
  calculatePasswordExpiry,
  isPasswordExpired,
} from '../lib/auth';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}

async function logAudit(
  db: any,
  params: {
    userId?: number | null;
    userEmail?: string | null;
    userRole?: string | null;
    action: string;
    resourceType?: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    statusCode?: number;
    success: boolean;
    errorMessage?: string;
  }
) {
  try {
    await db.insert(auditLogs).values({
      userId: params.userId ?? null,
      userEmail: params.userEmail ?? null,
      userRole: params.userRole ?? null,
      action: params.action,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      statusCode: params.statusCode ?? null,
      success: params.success,
      errorMessage: params.errorMessage ?? null,
    });
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}

async function recordLoginAttempt(
  db: any,
  email: string,
  ip: string,
  success: boolean,
  userAgent?: string,
) {
  try {
    await db.insert(loginAttempts).values({
      email,
      ipAddress: ip,
      success,
      userAgent: userAgent ?? null,
    });
  } catch (err) {
    console.error('Login attempt log failed:', err);
  }
}

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
        return res.json({ features: [] });
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
      const { email, password, fullName, firstName, lastName, companyName, phone, userType: requestedRole, magicLinkToken } = req.body;

      // Support both fullName and firstName/lastName
      const resolvedFullName = fullName || (firstName && lastName ? `${firstName} ${lastName}` : null);

      if (!email || !password || !resolvedFullName) {
        return res.status(400).json({ error: 'Email, password, and name are required' });
      }

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          error: passwordValidation.errors.join('. ')
        });
      }

      const validRoles = ['broker', 'borrower', 'lender'];
      const userRole = validRoles.includes(requestedRole) ? requestedRole : 'broker';

      const existingUser = await storage.getUserByEmail(email.toLowerCase());
      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await hashPassword(password);

      const onboardingCompleted = userRole === 'borrower';

      let resolvedTenantId: number | null = null;
      let resolvedInvitedBy: number | null = null;

      if (magicLinkToken) {
        const [borrowerMatch] = await db.select({
          id: users.id,
          tenantId: users.tenantId,
          borrowerMagicLinkEnabled: users.borrowerMagicLinkEnabled,
        }).from(users).where(eq(users.borrowerMagicLink, magicLinkToken));

        if (borrowerMatch && borrowerMatch.borrowerMagicLinkEnabled) {
          resolvedTenantId = borrowerMatch.tenantId;
          resolvedInvitedBy = borrowerMatch.id;
        } else {
          const [brokerMatch] = await db.select({
            id: users.id,
            tenantId: users.tenantId,
            brokerMagicLinkEnabled: users.brokerMagicLinkEnabled,
          }).from(users).where(eq(users.brokerMagicLink, magicLinkToken));

          if (brokerMatch && brokerMatch.brokerMagicLinkEnabled) {
            resolvedTenantId = brokerMatch.tenantId;
            resolvedInvitedBy = brokerMatch.id;
          }
        }
      }

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
        userType: userRole,
        onboardingCompleted,
        passwordExpiresAt: calculatePasswordExpiry(),
        tenantId: resolvedTenantId || 1,
        ...(resolvedInvitedBy ? { invitedBy: resolvedInvitedBy } : {}),
      });

      await logAudit(db, {
        userId: user.id,
        userEmail: user.email,
        userRole: userRole,
        action: 'user.registered',
        resourceType: 'user',
        resourceId: String(user.id),
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
        statusCode: 201,
        success: true,
      });

      if (userRole === 'broker') {
        const portalLink = `${process.env.BASE_URL || `${req.protocol}://${req.get('host')}`}/broker-portal`;
        sendBrokerWelcomeEmail(user.email, resolvedFullName, portalLink, user.tenantId, companyName || null).catch(err => {
          console.error('Failed to send broker welcome email:', err);
        });
      }

      const token = generateToken(user.id, user.email, user.tokenVersion ?? 0);
      setAuthCookie(res, token);

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
          userType: user.role,
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
      const clientIp = getClientIp(req);
      const ua = req.headers['user-agent'] || '';

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const normalizedEmail = email.toLowerCase();
      const user = await storage.getUserByEmail(normalizedEmail);

      if (!user) {
        await recordLoginAttempt(db, normalizedEmail, clientIp, false, ua);
        await logAudit(db, {
          userEmail: normalizedEmail,
          action: 'user.login_failed',
          resourceType: 'user',
          ipAddress: clientIp,
          userAgent: ua,
          statusCode: 401,
          success: false,
          errorMessage: 'User not found',
        });
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (!user.isActive) {
        await recordLoginAttempt(db, normalizedEmail, clientIp, false, ua);
        await logAudit(db, {
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          action: 'user.login_failed',
          resourceType: 'user',
          resourceId: String(user.id),
          ipAddress: clientIp,
          userAgent: ua,
          statusCode: 403,
          success: false,
          errorMessage: 'Account deactivated',
        });
        return res.status(403).json({ error: 'Account has been deactivated' });
      }

      const failedAttempts = user.failedLoginAttempts ?? 0;
      const lockedUntil = user.accountLockedUntil ?? null;
      const locked = isAccountLocked(failedAttempts, lockedUntil);

      if (!locked && failedAttempts >= PASSWORD_POLICY.maxFailedAttempts && lockedUntil && lockedUntil <= new Date()) {
        await storage.updateUser(user.id, {
          failedLoginAttempts: 0,
          accountLockedUntil: null,
        });
      }

      if (locked) {
        await recordLoginAttempt(db, normalizedEmail, clientIp, false, ua);
        await logAudit(db, {
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          action: 'user.login_blocked',
          resourceType: 'user',
          resourceId: String(user.id),
          ipAddress: clientIp,
          userAgent: ua,
          statusCode: 423,
          success: false,
          errorMessage: 'Account locked due to too many failed attempts',
        });
        return res.status(423).json({
          error: 'Account temporarily locked due to too many failed login attempts. Please try again in 30 minutes.',
        });
      }

      if (!user.passwordHash) {
        return res.status(401).json({ error: 'This account uses Google login. Please sign in with Google.' });
      }

      const isValid = await comparePassword(password, user.passwordHash);

      if (!isValid) {
        const newFailedCount = (user.failedLoginAttempts ?? 0) + 1;
        const updates: Record<string, any> = { failedLoginAttempts: newFailedCount };
        if (newFailedCount >= PASSWORD_POLICY.maxFailedAttempts) {
          updates.accountLockedUntil = calculateLockoutUntil();
        }
        await storage.updateUser(user.id, updates);
        await recordLoginAttempt(db, normalizedEmail, clientIp, false, ua);
        await logAudit(db, {
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          action: 'user.login_failed',
          resourceType: 'user',
          resourceId: String(user.id),
          ipAddress: clientIp,
          userAgent: ua,
          statusCode: 401,
          success: false,
          errorMessage: `Invalid password (attempt ${newFailedCount}/${PASSWORD_POLICY.maxFailedAttempts})`,
        });

        if (newFailedCount >= PASSWORD_POLICY.maxFailedAttempts) {
          await logAudit(db, {
            userId: user.id,
            userEmail: user.email,
            userRole: user.role,
            action: 'user.locked',
            resourceType: 'user',
            resourceId: String(user.id),
            ipAddress: clientIp,
            userAgent: ua,
            statusCode: 423,
            success: true,
            errorMessage: `Account locked after ${PASSWORD_POLICY.maxFailedAttempts} failed attempts`,
          });
        }

        return res.status(401).json({ error: 'Invalid email or password' });
      }

      await storage.updateUser(user.id, {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        accountLockedUntil: null,
      });
      await recordLoginAttempt(db, normalizedEmail, clientIp, true, ua);
      await logAudit(db, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'user.login',
        resourceType: 'user',
        resourceId: String(user.id),
        ipAddress: clientIp,
        userAgent: ua,
        statusCode: 200,
        success: true,
      });

      const passwordExpired = isPasswordExpired(user.passwordExpiresAt ?? null);

      const token = generateToken(user.id, user.email, user.tokenVersion ?? 0);
      setAuthCookie(res, token);

      const nameParts = user.fullName?.split(' ') || [];
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      res.json({
        success: true,
        passwordExpired,
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

  // Change password (authenticated)
  app.post('/api/auth/change-password', deps.authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const clientIp = getClientIp(req);
      const ua = req.headers['user-agent'] || '';

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
      }

      const user = await storage.getUserById(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.passwordHash) {
        return res.status(400).json({ error: 'This account uses Google login and has no password to change.' });
      }

      const isCurrentValid = await comparePassword(currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        await logAudit(db, {
          userId: user.id,
          userEmail: user.email,
          userRole: user.role,
          action: 'user.password_change_failed',
          resourceType: 'user',
          resourceId: String(user.id),
          ipAddress: clientIp,
          userAgent: ua,
          statusCode: 401,
          success: false,
          errorMessage: 'Current password incorrect',
        });
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const pwValidation = validatePassword(newPassword);
      if (!pwValidation.isValid) {
        return res.status(400).json({ error: pwValidation.errors.join('. ') });
      }

      const newHash = await hashPassword(newPassword);
      const newTokenVersion = (user.tokenVersion ?? 0) + 1;
      await storage.updateUser(user.id, {
        passwordHash: newHash,
        failedLoginAttempts: 0,
        accountLockedUntil: null,
        passwordExpiresAt: calculatePasswordExpiry(),
        tokenVersion: newTokenVersion,
      });

      await logAudit(db, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'user.password_changed',
        resourceType: 'user',
        resourceId: String(user.id),
        ipAddress: clientIp,
        userAgent: ua,
        statusCode: 200,
        success: true,
        newValues: { tokenVersion: newTokenVersion },
      });

      const freshToken = generateToken(user.id, user.email, newTokenVersion);
      setAuthCookie(res, freshToken);

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // Logout
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = req.cookies?.auth_token;
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        logAudit(db, {
          userId: decoded.userId,
          userEmail: decoded.email,
          action: 'user.logout',
          resourceType: 'user',
          resourceId: String(decoded.userId),
          ipAddress: getClientIp(req),
          userAgent: req.headers['user-agent'] || '',
          statusCode: 200,
          success: true,
        });
      }
    }
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

    const userType = req.query.userType as string | undefined;
    const returnTo = req.query.returnTo as string | undefined;
    const inviteToken = req.query.inviteToken as string | undefined;
    const magicLinkToken = req.query.magicLinkToken as string | undefined;
    const stateObj: Record<string, string> = {};
    if (userType && ['broker', 'borrower', 'lender'].includes(userType)) {
      stateObj.userType = userType;
    }
    if (returnTo && returnTo.startsWith('/')) {
      stateObj.returnTo = returnTo;
    }
    if (inviteToken) {
      stateObj.inviteToken = inviteToken;
    }
    if (magicLinkToken) {
      stateObj.magicLinkToken = magicLinkToken;
    }

    const authorizeUrl = googleOAuth.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/drive.file',
      ],
      prompt: 'consent',
      state: Object.keys(stateObj).length > 0 ? JSON.stringify(stateObj) : undefined,
    });

    res.redirect(authorizeUrl);
  });

  // Google OAuth - callback handler
  app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    console.log('Google OAuth callback hit. Query params:', JSON.stringify(req.query));
    try {
      const { code, state } = req.query;
      let oauthState: Record<string, string> = {};
      if (state && typeof state === 'string') {
        try { oauthState = JSON.parse(state); } catch {}
      }
      const requestedUserType = oauthState.userType || null;

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

      const oauthInviteToken = oauthState.inviteToken || null;
      if (oauthInviteToken) {
        const [invitedUser] = await db.select().from(users).where(eq(users.inviteToken, oauthInviteToken));
        if (!invitedUser) {
          return res.redirect('/login?error=invite_invalid');
        }
        if (invitedUser.inviteTokenExpires && new Date() > new Date(invitedUser.inviteTokenExpires)) {
          return res.redirect('/login?error=invite_expired');
        }
        if (email !== invitedUser.email.toLowerCase()) {
          return res.redirect('/login?error=invite_email_mismatch');
        }
        await storage.updateUser(invitedUser.id, {
          googleId,
          avatarUrl: avatarUrl || invitedUser.avatarUrl,
          inviteToken: null,
          inviteTokenExpires: null,
          inviteStatus: 'accepted',
          emailVerified: true,
          isActive: true,
          lastLoginAt: new Date(),
          ...tokenUpdates,
        });
        user = await storage.getUserById(invitedUser.id);
        const jwtToken = generateToken(user!.id, user!.email, user!.tokenVersion ?? 0);
        setAuthCookie(res, jwtToken);
        if (user!.role === 'broker') {
          const link = `${process.env.BASE_URL || `${req.protocol}://${req.get('host')}`}/broker-portal`;
          sendBrokerWelcomeEmail(user!.email, user!.fullName || email, link, user!.tenantId, user!.companyName).catch(err => {
            console.error('Failed to send broker welcome email (invite accept):', err);
          });
          if (!user!.onboardingCompleted) {
            return res.redirect('/onboarding');
          }
        }
        return res.redirect('/');
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
        const assignedRole = requestedUserType && ['broker', 'borrower', 'lender'].includes(requestedUserType)
          ? requestedUserType
          : null;
        const onboardingCompleted = assignedRole === 'borrower';

        let oauthTenantId: number | null = null;
        let oauthInvitedById: number | null = null;
        const oauthMagicLinkToken = oauthState.magicLinkToken || null;
        if (oauthMagicLinkToken) {
          const [bMatch] = await db.select({ id: users.id, tenantId: users.tenantId, borrowerMagicLinkEnabled: users.borrowerMagicLinkEnabled })
            .from(users).where(eq(users.borrowerMagicLink, oauthMagicLinkToken));
          if (bMatch && bMatch.borrowerMagicLinkEnabled) {
            oauthTenantId = bMatch.tenantId;
            oauthInvitedById = bMatch.id;
          } else {
            const [brMatch] = await db.select({ id: users.id, tenantId: users.tenantId, brokerMagicLinkEnabled: users.brokerMagicLinkEnabled })
              .from(users).where(eq(users.brokerMagicLink, oauthMagicLinkToken));
            if (brMatch && brMatch.brokerMagicLinkEnabled) {
              oauthTenantId = brMatch.tenantId;
              oauthInvitedById = brMatch.id;
            }
          }
        }

        user = await storage.createUser({
          email,
          passwordHash: null,
          fullName,
          googleId,
          avatarUrl,
          emailVerified: true,
          isActive: true,
          userType: assignedRole,
          onboardingCompleted,
          companyName: null,
          phone: null,
          passwordResetToken: null,
          passwordResetExpires: null,
          role: assignedRole || 'broker',
          tenantId: oauthTenantId || 1,
          ...(oauthInvitedById ? { invitedBy: oauthInvitedById } : {}),
        });

        if ((assignedRole || 'broker') === 'broker') {
          const link = `${process.env.BASE_URL || `${req.protocol}://${req.get('host')}`}/broker-portal`;
          sendBrokerWelcomeEmail(email, fullName || email, link, user.tenantId, user.companyName).catch(err => {
            console.error('Failed to send broker welcome email (OAuth):', err);
          });
        }
      }

      const token = generateToken(user.id, user.email, user.tokenVersion ?? 0);
      setAuthCookie(res, token);

      const returnTo = oauthState.returnTo || null;
      if (returnTo && returnTo.startsWith('/')) {
        res.redirect(returnTo);
      } else if (!user.role || user.role === 'user') {
        res.redirect('/select-role');
      } else if (['lender', 'super_admin', 'admin', 'staff', 'processor'].includes(user.role)) {
        res.redirect('/admin/onboarding');
      } else if (user.role === 'broker' && !user.onboardingCompleted) {
        res.redirect('/onboarding');
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
          userType: user.role,
          onboardingCompleted: user.onboardingCompleted,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  app.patch('/api/auth/profile', deps.authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.user!.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { fullName, phone, companyName, brokerCompanyName, brokerLicenseNumber, brokerOperatingStates, brokerYearsExperience, brokerPreferredLoanTypes } = req.body;
      const updates: Record<string, any> = {};
      if (fullName !== undefined) updates.fullName = fullName;
      if (phone !== undefined) updates.phone = phone;
      if (companyName !== undefined) updates.companyName = companyName;
      if (brokerCompanyName !== undefined) updates.brokerCompanyName = brokerCompanyName;
      if (brokerLicenseNumber !== undefined) updates.brokerLicenseNumber = brokerLicenseNumber;
      if (brokerOperatingStates !== undefined) updates.brokerOperatingStates = brokerOperatingStates;
      if (brokerYearsExperience !== undefined) updates.brokerYearsExperience = brokerYearsExperience;
      if (brokerPreferredLoanTypes !== undefined) updates.brokerPreferredLoanTypes = brokerPreferredLoanTypes;

      await storage.updateUser(user.id, updates);
      res.json({ success: true });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  app.post('/api/auth/complete-onboarding', deps.authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const user = await storage.getUserById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      await storage.updateUser(user.id, { onboardingCompleted: true });
      res.json({ success: true });
    } catch (error) {
      console.error('Complete onboarding error:', error);
      res.status(500).json({ error: 'Failed to complete onboarding' });
    }
  });

  // Select user type (for Google OAuth users who haven't chosen yet)
  app.post('/api/auth/select-user-type', deps.authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const { userType: selectedRole } = req.body;
      if (!['broker', 'borrower', 'lender'].includes(selectedRole)) {
        return res.status(400).json({ error: 'Invalid role. Must be broker, borrower, or lender.' });
      }
      const user = await storage.getUserById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (user.role && user.role !== 'user') {
        return res.status(400).json({ error: 'Role already set' });
      }
      await storage.updateUser(user.id, { role: selectedRole, userType: selectedRole });
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
      const resetUrl = `${baseUrl}/reset-password/${resetToken}`;

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

      const pwValidation = validatePassword(password);
      if (!pwValidation.isValid) {
        return res.status(400).json({
          error: pwValidation.errors.join('. ')
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
        passwordResetExpires: null,
        failedLoginAttempts: 0,
        accountLockedUntil: null,
        passwordExpiresAt: calculatePasswordExpiry(),
      });

      await logAudit(db, {
        userId: user.id,
        userEmail: user.email,
        action: 'user.password_changed',
        resourceType: 'user',
        resourceId: String(user.id),
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
        statusCode: 200,
        success: true,
      });

      res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });
}

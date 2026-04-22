import type { Express, Response, Request } from 'express';
import type { AuthRequest } from '../auth';
import type { RouteDeps } from './types';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { eq, and } from 'drizzle-orm';
import { emailAccounts, users, systemSettings } from '@shared/schema';
import { encryptToken } from '../utils/encryption';

/**
 * Unified Google Connect — single OAuth flow for Gmail + Drive
 *
 * Requests all scopes in one consent prompt:
 * - openid, email, profile (for user identity)
 * - gmail.readonly, gmail.modify (for email sync)
 * - drive.file (for document storage)
 *
 * On callback, stores tokens in:
 * - users table (googleRefreshToken, googleAccessToken) — used by Drive service
 * - emailAccounts table — used by Gmail sync service
 */

const UNIFIED_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.file',
];

function getBaseUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || req.get('host') || '';
  if (host) {
    return `${proto}://${host}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return `${proto}://${host}`;
}

function getOAuthClient(redirectUri?: string): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export function registerGoogleConnectRoutes(app: Express, deps: RouteDeps) {
  const { db, authenticateUser, storage } = deps;

  // ==================== STATUS ====================

  // GET /api/google/status — check what's connected for current user
  app.get('/api/google/status', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // Check Drive connection (tokens on users table)
      const [user] = await db.select({
        googleRefreshToken: users.googleRefreshToken,
        googleAccessToken: users.googleAccessToken,
        googleTokenExpiresAt: users.googleTokenExpiresAt,
      }).from(users).where(eq(users.id, userId));

      const hasOAuthTokens = !!user?.googleRefreshToken;

      // Check if a Drive folder ID has been configured
      const [folderSetting] = await db.select({
        settingValue: systemSettings.settingValue,
      }).from(systemSettings).where(eq(systemSettings.settingKey, 'google_drive_parent_folder_id'));
      const hasDriveFolderId = !!folderSetting?.settingValue;

      const driveConnected = hasOAuthTokens || hasDriveFolderId;

      // Check Gmail connection (emailAccounts table)
      const [emailAccount] = await db.select({
        id: emailAccounts.id,
        emailAddress: emailAccounts.emailAddress,
        isActive: emailAccounts.isActive,
        lastSyncAt: emailAccounts.lastSyncAt,
        syncStatus: emailAccounts.syncStatus,
      }).from(emailAccounts).where(
        and(
          eq(emailAccounts.userId, userId),
          eq(emailAccounts.isActive, true),
        )
      );

      const gmailConnected = !!emailAccount;

      res.json({
        connected: driveConnected && gmailConnected,
        gmail: {
          connected: gmailConnected,
          emailAddress: emailAccount?.emailAddress || null,
          lastSyncAt: emailAccount?.lastSyncAt || null,
          syncStatus: emailAccount?.syncStatus || null,
        },
        drive: {
          connected: driveConnected,
          folderId: folderSetting?.settingValue || null,
        },
      });
    } catch (error: any) {
      console.error('Error checking Google status:', error);
      res.status(500).json({ error: 'Failed to check Google connection status' });
    }
  });

  // ==================== CONNECT ====================

  // GET /api/google/connect — initiate unified OAuth flow
  app.get('/api/google/connect', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const returnTo = (req.query.returnTo as string) || '/admin/onboarding';

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        console.error('Google OAuth credentials not configured');
        const separator = returnTo.includes('?') ? '&' : '?';
        return res.redirect(`${returnTo}${separator}error=google_not_configured`);
      }

      const baseUrl = getBaseUrl(req);
      const redirectUri = `${baseUrl}/api/google/callback`;

      const state = Buffer.from(JSON.stringify({
        userId: req.user!.id,
        returnTo,
      })).toString('base64url');

      const client = getOAuthClient(redirectUri);
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        scope: UNIFIED_SCOPES,
        prompt: 'consent',
        state,
      });

      res.redirect(authUrl);
    } catch (error: any) {
      console.error('Error initiating Google connect:', error);
      const returnTo = (req.query.returnTo as string) || '/admin/onboarding';
      const separator = returnTo.includes('?') ? '&' : '?';
      res.redirect(`${returnTo}${separator}error=google_connect_failed`);
    }
  });

  // GET /api/google/callback — unified OAuth callback
  app.get('/api/google/callback', async (req: Request, res: Response) => {
    let returnTo = '/admin/onboarding';
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        console.error('Google OAuth error:', oauthError);
        return res.redirect(`${returnTo}?error=google_auth_denied`);
      }

      if (!code || !state) {
        return res.redirect(`${returnTo}?error=google_auth_failed`);
      }

      // Decode state
      const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
      const userId = stateData.userId;
      returnTo = stateData.returnTo || '/admin/onboarding';

      if (!userId) {
        return res.redirect(`${returnTo}?error=google_auth_failed`);
      }

      // Exchange code for tokens
      const baseUrl = getBaseUrl(req);
      const redirectUri = `${baseUrl}/api/google/callback`;
      const client = getOAuthClient(redirectUri);

      const { tokens } = await client.getToken(code as string);
      client.setCredentials(tokens);

      // ---- 1. Store Drive tokens on users table ----
      const userUpdates: Record<string, unknown> = {};
      if (tokens.refresh_token) {
        userUpdates.googleRefreshToken = encryptToken(tokens.refresh_token);
      }
      if (tokens.access_token) {
        userUpdates.googleAccessToken = encryptToken(tokens.access_token);
      }
      if (tokens.expiry_date) {
        userUpdates.googleTokenExpiresAt = new Date(tokens.expiry_date);
      }

      if (Object.keys(userUpdates).length > 0) {
        await db.update(users).set(userUpdates).where(eq(users.id, userId));
      }

      // ---- 2. Store Gmail tokens in emailAccounts table ----
      // Get the user's Gmail address
      const gmail = google.gmail({ version: 'v1', auth: client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const emailAddress = profile.data.emailAddress || '';

      if (emailAddress) {
        // Deactivate any existing email accounts for this user
        await db.update(emailAccounts).set({ isActive: false })
          .where(eq(emailAccounts.userId, userId));

        // Insert new email account
        await db.insert(emailAccounts).values({
          userId,
          emailAddress,
          provider: 'gmail',
          accessToken: tokens.access_token ? encryptToken(tokens.access_token) : null,
          refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          isActive: true,
          syncStatus: 'idle',
        });
      }

      // ---- 3. Also update Google ID and avatar if available ----
      if (tokens.id_token) {
        try {
          const ticket = await client.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
          });
          const payload = ticket.getPayload();
          if (payload) {
            const googleIdUpdate: Record<string, unknown> = {};
            if (payload.sub) googleIdUpdate.googleId = payload.sub;
            if (payload.picture) googleIdUpdate.avatarUrl = payload.picture;
            if (Object.keys(googleIdUpdate).length > 0) {
              await db.update(users).set(googleIdUpdate).where(eq(users.id, userId));
            }
          }
        } catch (idTokenError) {
          // Non-fatal — tokens are already stored
          console.warn('Could not verify id_token during Google connect:', idTokenError);
        }
      }

      console.log(`Google connect successful for user ${userId}: Gmail=${emailAddress}, Drive=connected`);

      const separator = returnTo.includes('?') ? '&' : '?';
      res.redirect(`${returnTo}${separator}success=google_connected`);
    } catch (error: any) {
      console.error('Google connect callback error:', error);
      const separator = returnTo.includes('?') ? '&' : '?';
      res.redirect(`${returnTo}${separator}error=google_auth_failed`);
    }
  });

  // ==================== DISCONNECT ====================

  // POST /api/google/disconnect — disconnect both Gmail and Drive
  app.post('/api/google/disconnect', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // Clear Drive tokens from users table
      await db.update(users).set({
        googleRefreshToken: null,
        googleAccessToken: null,
        googleTokenExpiresAt: null,
      }).where(eq(users.id, userId));

      // Deactivate email accounts
      await db.update(emailAccounts).set({ isActive: false })
        .where(eq(emailAccounts.userId, userId));

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error disconnecting Google:', error);
      res.status(500).json({ error: 'Failed to disconnect Google' });
    }
  });
}

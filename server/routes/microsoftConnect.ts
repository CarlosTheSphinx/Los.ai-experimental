import type { Express, Response, Request } from 'express';
import type { AuthRequest } from '../auth';
import type { RouteDeps } from './types';
import { eq, and } from 'drizzle-orm';
import { emailAccounts, users } from '@shared/schema';
import { encryptToken } from '../utils/encryption';

/**
 * Unified Microsoft Connect — single OAuth flow for Outlook + OneDrive
 *
 * Requests all scopes in one consent prompt:
 * - openid, profile, email (for user identity)
 * - Mail.Read, Mail.ReadWrite (for email sync)
 * - Files.ReadWrite (for OneDrive document storage)
 * - offline_access (for refresh token)
 *
 * On callback, stores tokens in:
 * - users table (microsoftRefreshToken, microsoftAccessToken) — used by OneDrive service
 * - emailAccounts table (provider='outlook') — used by Outlook sync service
 *
 * Env vars required:
 * - MICROSOFT_CLIENT_ID  (from Azure AD app registration)
 * - MICROSOFT_CLIENT_SECRET
 */

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MICROSOFT_GRAPH_URL = 'https://graph.microsoft.com/v1.0';

const UNIFIED_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'Mail.Read',
  'Mail.ReadWrite',
  'Files.ReadWrite',
].join(' ');

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

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth credentials not configured (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET)');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: UNIFIED_SCOPES,
  });

  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Microsoft token exchange failed:', errorBody);
    throw new Error(`Microsoft token exchange failed: ${response.status}`);
  }

  return await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
    id_token?: string;
  };
}

async function getMicrosoftProfile(accessToken: string) {
  const response = await fetch(`${MICROSOFT_GRAPH_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to get Microsoft profile: ${response.status}`);
  }

  return await response.json() as {
    id: string;
    displayName: string;
    mail: string | null;
    userPrincipalName: string;
  };
}

export function registerMicrosoftConnectRoutes(app: Express, deps: RouteDeps) {
  const { db, authenticateUser } = deps;

  // ==================== STATUS ====================

  app.get('/api/microsoft/status', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // Check OneDrive connection (tokens on users table)
      const [user] = await db.select({
        microsoftRefreshToken: users.microsoftRefreshToken,
        microsoftAccessToken: users.microsoftAccessToken,
        microsoftTokenExpiresAt: users.microsoftTokenExpiresAt,
      }).from(users).where(eq(users.id, userId));

      const oneDriveConnected = !!user?.microsoftRefreshToken;

      // Check Outlook connection (emailAccounts table, provider='outlook')
      const [emailAccount] = await db.select({
        id: emailAccounts.id,
        emailAddress: emailAccounts.emailAddress,
        isActive: emailAccounts.isActive,
        lastSyncAt: emailAccounts.lastSyncAt,
        syncStatus: emailAccounts.syncStatus,
      }).from(emailAccounts).where(
        and(
          eq(emailAccounts.userId, userId),
          eq(emailAccounts.provider, 'outlook'),
          eq(emailAccounts.isActive, true),
        )
      );

      const outlookConnected = !!emailAccount;

      res.json({
        connected: oneDriveConnected || outlookConnected,
        outlook: {
          connected: outlookConnected,
          emailAddress: emailAccount?.emailAddress || null,
          lastSyncAt: emailAccount?.lastSyncAt || null,
          syncStatus: emailAccount?.syncStatus || null,
        },
        oneDrive: {
          connected: oneDriveConnected,
        },
      });
    } catch (error: any) {
      console.error('Error checking Microsoft status:', error);
      res.status(500).json({ error: 'Failed to check Microsoft connection status' });
    }
  });

  // ==================== CONNECT ====================

  app.get('/api/microsoft/connect', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      if (!clientId) {
        const returnTo = (req.query.returnTo as string) || '/admin/onboarding';
        return res.redirect(`${returnTo}?error=microsoft_not_configured`);
      }

      const returnTo = (req.query.returnTo as string) || '/admin/onboarding';
      const baseUrl = getBaseUrl(req);
      const redirectUri = `${baseUrl}/api/microsoft/callback`;

      const state = Buffer.from(JSON.stringify({
        userId: req.user!.id,
        returnTo,
      })).toString('base64url');

      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: UNIFIED_SCOPES,
        response_mode: 'query',
        state,
        prompt: 'consent',
      });

      res.redirect(`${MICROSOFT_AUTH_URL}?${params.toString()}`);
    } catch (error: any) {
      console.error('Error initiating Microsoft connect:', error);
      const returnTo = (req.query.returnTo as string) || '/admin/onboarding';
      const separator = returnTo.includes('?') ? '&' : '?';
      res.redirect(`${returnTo}${separator}error=microsoft_connect_failed`);
    }
  });

  // ==================== CALLBACK ====================

  app.get('/api/microsoft/callback', async (req: Request, res: Response) => {
    let returnTo = '/admin/onboarding';
    try {
      const { code, state, error: oauthError, error_description } = req.query;

      if (oauthError) {
        console.error('Microsoft OAuth error:', oauthError, error_description);
        return res.redirect(`${returnTo}?error=microsoft_auth_denied`);
      }

      if (!code || !state) {
        return res.redirect(`${returnTo}?error=microsoft_auth_failed`);
      }

      // Decode state
      const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
      const userId = stateData.userId;
      returnTo = stateData.returnTo || '/admin/onboarding';

      if (!userId) {
        return res.redirect(`${returnTo}?error=microsoft_auth_failed`);
      }

      // Exchange code for tokens
      const baseUrl = getBaseUrl(req);
      const redirectUri = `${baseUrl}/api/microsoft/callback`;
      const tokens = await exchangeCodeForTokens(code as string, redirectUri);

      // ---- 1. Store OneDrive tokens on users table ----
      const userUpdates: Record<string, unknown> = {};
      if (tokens.refresh_token) {
        userUpdates.microsoftRefreshToken = encryptToken(tokens.refresh_token);
      }
      if (tokens.access_token) {
        userUpdates.microsoftAccessToken = encryptToken(tokens.access_token);
      }
      userUpdates.microsoftTokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      if (Object.keys(userUpdates).length > 0) {
        await db.update(users).set(userUpdates).where(eq(users.id, userId));
      }

      // ---- 2. Store Outlook tokens in emailAccounts table ----
      const profile = await getMicrosoftProfile(tokens.access_token);
      const emailAddress = profile.mail || profile.userPrincipalName || '';

      if (emailAddress) {
        // Deactivate any existing Outlook accounts for this user
        await db.update(emailAccounts).set({ isActive: false })
          .where(and(
            eq(emailAccounts.userId, userId),
            eq(emailAccounts.provider, 'outlook'),
          ));

        // Insert new email account
        await db.insert(emailAccounts).values({
          userId,
          emailAddress,
          provider: 'outlook',
          accessToken: encryptToken(tokens.access_token),
          refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          isActive: true,
          syncStatus: 'idle',
        });
      }

      // ---- 3. Update Microsoft ID on user record ----
      if (profile.id) {
        await db.update(users).set({ microsoftId: profile.id }).where(eq(users.id, userId));
      }

      console.log(`Microsoft connect successful for user ${userId}: Outlook=${emailAddress}, OneDrive=connected`);

      const separator = returnTo.includes('?') ? '&' : '?';
      res.redirect(`${returnTo}${separator}success=microsoft_connected`);
    } catch (error: any) {
      console.error('Microsoft connect callback error:', error);
      const separator = returnTo.includes('?') ? '&' : '?';
      res.redirect(`${returnTo}${separator}error=microsoft_auth_failed`);
    }
  });

  // ==================== DISCONNECT ====================

  app.post('/api/microsoft/disconnect', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      // Clear OneDrive tokens from users table
      await db.update(users).set({
        microsoftRefreshToken: null,
        microsoftAccessToken: null,
        microsoftTokenExpiresAt: null,
      }).where(eq(users.id, userId));

      // Deactivate Outlook email accounts
      await db.update(emailAccounts).set({ isActive: false })
        .where(and(
          eq(emailAccounts.userId, userId),
          eq(emailAccounts.provider, 'outlook'),
        ));

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error disconnecting Microsoft:', error);
      res.status(500).json({ error: 'Failed to disconnect Microsoft' });
    }
  });
}

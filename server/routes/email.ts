import type { Express, Response } from 'express';
import type { AuthRequest } from '../auth';
import type { RouteDeps } from './types';
import { eq, desc, and, sql, ilike, or, inArray } from 'drizzle-orm';
import { emailAccounts, emailThreads, emailMessages, emailThreadDealLinks, projects, users } from '@shared/schema';
import { getGmailAuthUrl, exchangeGmailCode, syncEmails, getAttachment, checkLinkedThreadsForNewEmails } from '../services/gmail';
import { encryptToken } from '../utils/encryption';

export function registerEmailRoutes(app: Express, deps: RouteDeps) {
  const { db, authenticateUser, requireAdmin } = deps;

  // ==================== EMAIL ACCOUNT MANAGEMENT ====================

  // GET /api/email/account - Get current user's connected email account
  app.get('/api/email/account', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const [account] = await db.select({
        id: emailAccounts.id,
        emailAddress: emailAccounts.emailAddress,
        provider: emailAccounts.provider,
        isActive: emailAccounts.isActive,
        lastSyncAt: emailAccounts.lastSyncAt,
        syncStatus: emailAccounts.syncStatus,
        createdAt: emailAccounts.createdAt,
      }).from(emailAccounts)
        .where(and(
          eq(emailAccounts.userId, req.user!.id),
          eq(emailAccounts.isActive, true)
        ));
      
      res.json({ account: account || null });
    } catch (error: any) {
      console.error('Error fetching email account:', error);
      res.status(500).json({ error: 'Failed to fetch email account' });
    }
  });

  // GET /api/email/connect/check - Pre-check if Gmail OAuth is properly configured
  app.get('/api/email/connect/check', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.json({ ready: false, reason: 'Google OAuth credentials (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) are not configured.' });
      }
      res.json({ ready: true });
    } catch (error: any) {
      res.json({ ready: false, reason: error.message });
    }
  });

  // GET /api/email/connect - Initiate Gmail OAuth flow for email
  app.get('/api/email/connect', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        const returnTo = (req.query.returnTo as string) || '/admin/email';
        const separator = returnTo.includes('?') ? '&' : '?';
        return res.redirect(`${returnTo}${separator}error=email_not_configured`);
      }

      const returnTo = (req.query.returnTo as string) || '/admin/email';
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers['host'] || '';
      const baseUrl = `${protocol}://${host}`;
      const redirectUri = `${baseUrl}/api/email/callback`;
      const state = Buffer.from(JSON.stringify({ userId: req.user!.id, returnTo })).toString('base64url');
      
      const authUrl = getGmailAuthUrl(redirectUri, state);
      res.redirect(authUrl);
    } catch (error: any) {
      console.error('Error initiating email connect:', error);
      const returnTo = (req.query.returnTo as string) || '/admin/email';
      const separator = returnTo.includes('?') ? '&' : '?';
      res.redirect(`${returnTo}${separator}error=email_connect_failed`);
    }
  });

  // GET /api/email/callback - Gmail OAuth callback
  app.get('/api/email/callback', async (req: AuthRequest, res: Response) => {
    let returnTo = '/admin/email';
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        return res.redirect('/admin/email?error=email_auth_failed');
      }

      const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
      const userId = stateData.userId;
      returnTo = stateData.returnTo || '/admin/email';
      
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers['host'] || '';
      const baseUrl = `${protocol}://${host}`;
      const redirectUri = `${baseUrl}/api/email/callback`;

      const tokens = await exchangeGmailCode(code as string, redirectUri);
      
      const { OAuth2Client } = await import('google-auth-library');
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      client.setCredentials(tokens);
      const { google } = await import('googleapis');
      const gmail = google.gmail({ version: 'v1', auth: client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const emailAddress = profile.data.emailAddress || '';

      await db.update(emailAccounts).set({ isActive: false })
        .where(eq(emailAccounts.userId, userId));

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

      const separator = returnTo.includes('?') ? '&' : '?';
      res.redirect(`${returnTo}${separator}success=email_connected`);
    } catch (error: any) {
      console.error('Email OAuth callback error:', error);
      const separator = returnTo.includes('?') ? '&' : '?';
      res.redirect(`${returnTo}${separator}error=email_auth_failed`);
    }
  });

  // POST /api/email/disconnect - Disconnect email account
  app.post('/api/email/disconnect', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      await db.update(emailAccounts).set({ isActive: false })
        .where(and(
          eq(emailAccounts.userId, req.user!.id),
          eq(emailAccounts.isActive, true)
        ));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error disconnecting email:', error);
      res.status(500).json({ error: 'Failed to disconnect email' });
    }
  });

  // POST /api/email/sync - Trigger manual email sync
  app.post('/api/email/sync', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const [account] = await db.select().from(emailAccounts)
        .where(and(
          eq(emailAccounts.userId, req.user!.id),
          eq(emailAccounts.isActive, true)
        ));
      
      if (!account) {
        return res.status(404).json({ error: 'No active email account found' });
      }

      const result = await syncEmails(account.id);
      
      await checkLinkedThreadsForNewEmails(account.id);
      
      res.json({ success: true, synced: result.synced, errors: result.errors });
    } catch (error: any) {
      console.error('Error syncing email:', error);
      res.status(500).json({ error: 'Failed to sync email' });
    }
  });

  // ==================== EMAIL THREADS & MESSAGES ====================

  // GET /api/email/threads - List email threads with pagination and search
  app.get('/api/email/threads', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const [account] = await db.select().from(emailAccounts)
        .where(and(
          eq(emailAccounts.userId, req.user!.id),
          eq(emailAccounts.isActive, true)
        ));
      
      if (!account) {
        return res.json({ threads: [], total: 0 });
      }

      const { search, limit = '50', offset = '0', linked, dealId } = req.query;
      const limitNum = Math.min(parseInt(limit as string) || 50, 100);
      const offsetNum = parseInt(offset as string) || 0;

      let query = db.select().from(emailThreads)
        .where(eq(emailThreads.accountId, account.id))
        .orderBy(desc(emailThreads.lastMessageAt))
        .limit(limitNum)
        .offset(offsetNum);

      let threads = await db.select().from(emailThreads)
        .where(eq(emailThreads.accountId, account.id))
        .orderBy(desc(emailThreads.lastMessageAt));

      if (search) {
        const searchLower = (search as string).toLowerCase();
        threads = threads.filter(t => 
          t.subject?.toLowerCase().includes(searchLower) ||
          t.fromName?.toLowerCase().includes(searchLower) ||
          t.fromAddress?.toLowerCase().includes(searchLower) ||
          t.snippet?.toLowerCase().includes(searchLower)
        );
      }

      const threadIds = threads.map(t => t.id);
      let dealLinks: any[] = [];
      if (threadIds.length > 0) {
        dealLinks = await db.select({
          emailThreadId: emailThreadDealLinks.emailThreadId,
          dealId: emailThreadDealLinks.dealId,
        }).from(emailThreadDealLinks)
          .where(inArray(emailThreadDealLinks.emailThreadId, threadIds));
      }

      const dealLinkMap = new Map<number, number[]>();
      for (const link of dealLinks) {
        if (!dealLinkMap.has(link.emailThreadId)) dealLinkMap.set(link.emailThreadId, []);
        dealLinkMap.get(link.emailThreadId)!.push(link.dealId);
      }

      if (linked === 'true') {
        threads = threads.filter(t => dealLinkMap.has(t.id));
      } else if (linked === 'false') {
        threads = threads.filter(t => !dealLinkMap.has(t.id));
      }

      if (dealId) {
        const dId = parseInt(dealId as string);
        threads = threads.filter(t => dealLinkMap.get(t.id)?.includes(dId));
      }

      const total = threads.length;
      threads = threads.slice(offsetNum, offsetNum + limitNum);

      const enrichedThreads = threads.map(t => ({
        ...t,
        linkedDealIds: dealLinkMap.get(t.id) || [],
      }));

      res.json({ threads: enrichedThreads, total });
    } catch (error: any) {
      console.error('Error listing email threads:', error);
      res.status(500).json({ error: 'Failed to list email threads' });
    }
  });

  // GET /api/email/threads/:id - Get thread detail with messages
  app.get('/api/email/threads/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const threadId = parseInt(req.params.id);
      const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, threadId));
      
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      const [account] = await db.select().from(emailAccounts)
        .where(and(
          eq(emailAccounts.id, thread.accountId),
          eq(emailAccounts.userId, req.user!.id)
        ));
      
      if (!account) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const threadMessages = await db.select().from(emailMessages)
        .where(eq(emailMessages.threadId, threadId))
        .orderBy(emailMessages.internalDate);

      const links = await db.select({
        dealId: emailThreadDealLinks.dealId,
        linkedBy: emailThreadDealLinks.linkedBy,
        linkedAt: emailThreadDealLinks.linkedAt,
      }).from(emailThreadDealLinks)
        .where(eq(emailThreadDealLinks.emailThreadId, threadId));

      const dealInfos = [];
      for (const link of links) {
        const [deal] = await db.select({
          id: projects.id,
          borrowerName: projects.borrowerName,
          propertyAddress: projects.propertyAddress,
        }).from(projects).where(eq(projects.id, link.dealId));
        if (deal) {
          dealInfos.push({ ...link, deal });
        }
      }

      res.json({ thread, messages: threadMessages, dealLinks: dealInfos });
    } catch (error: any) {
      console.error('Error getting email thread:', error);
      res.status(500).json({ error: 'Failed to get email thread' });
    }
  });

  // ==================== DEAL LINKING ====================

  // POST /api/email/threads/:id/link - Link email thread to a deal
  app.post('/api/email/threads/:id/link', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const threadId = parseInt(req.params.id);
      const { dealId } = req.body;
      
      if (!dealId) {
        return res.status(400).json({ error: 'dealId is required' });
      }

      const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, threadId));
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      
      const [account] = await db.select().from(emailAccounts)
        .where(and(eq(emailAccounts.id, thread.accountId), eq(emailAccounts.userId, req.user!.id)));
      if (!account) return res.status(403).json({ error: 'Access denied' });

      const [existing] = await db.select().from(emailThreadDealLinks)
        .where(and(
          eq(emailThreadDealLinks.emailThreadId, threadId),
          eq(emailThreadDealLinks.dealId, dealId)
        ));
      
      if (existing) {
        return res.status(409).json({ error: 'Thread already linked to this deal' });
      }

      const [link] = await db.insert(emailThreadDealLinks).values({
        emailThreadId: threadId,
        dealId,
        linkedBy: req.user!.id,
      }).returning();

      res.json({ link });
    } catch (error: any) {
      console.error('Error linking thread to deal:', error);
      res.status(500).json({ error: 'Failed to link thread to deal' });
    }
  });

  // DELETE /api/email/threads/:id/link/:dealId - Unlink email thread from a deal
  app.delete('/api/email/threads/:id/link/:dealId', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const threadId = parseInt(req.params.id);
      const dealId = parseInt(req.params.dealId);

      await db.delete(emailThreadDealLinks)
        .where(and(
          eq(emailThreadDealLinks.emailThreadId, threadId),
          eq(emailThreadDealLinks.dealId, dealId)
        ));

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error unlinking thread from deal:', error);
      res.status(500).json({ error: 'Failed to unlink thread from deal' });
    }
  });

  // GET /api/email/deals/:dealId/threads - Get email threads linked to a deal
  app.get('/api/email/deals/:dealId/threads', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      
      const linkedThreads = await db.select({
        thread: emailThreads,
        linkedAt: emailThreadDealLinks.linkedAt,
      })
      .from(emailThreadDealLinks)
      .innerJoin(emailThreads, eq(emailThreadDealLinks.emailThreadId, emailThreads.id))
      .where(eq(emailThreadDealLinks.dealId, dealId))
      .orderBy(desc(emailThreads.lastMessageAt));

      res.json({ threads: linkedThreads.map(r => ({ ...r.thread, linkedAt: r.linkedAt })) });
    } catch (error: any) {
      console.error('Error fetching deal email threads:', error);
      res.status(500).json({ error: 'Failed to fetch deal email threads' });
    }
  });

  // ==================== ATTACHMENTS ====================

  // GET /api/email/messages/:messageId/attachments/:attachmentId - Download attachment
  app.get('/api/email/messages/:messageId/attachments/:attachmentId', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { messageId, attachmentId } = req.params;
      
      const [message] = await db.select().from(emailMessages)
        .where(eq(emailMessages.gmailMessageId, messageId));
      
      if (!message) return res.status(404).json({ error: 'Message not found' });
      
      const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, message.threadId));
      if (!thread) return res.status(404).json({ error: 'Thread not found' });
      
      const [account] = await db.select().from(emailAccounts)
        .where(and(eq(emailAccounts.id, thread.accountId), eq(emailAccounts.userId, req.user!.id)));
      if (!account) return res.status(403).json({ error: 'Access denied' });

      const result = await getAttachment(account.id, messageId, attachmentId);
      if (!result) return res.status(404).json({ error: 'Attachment not found' });

      let filename = 'attachment';
      let mimeType = 'application/octet-stream';
      if (message.attachments && Array.isArray(message.attachments)) {
        const att = (message.attachments as any[]).find(a => a.attachmentId === attachmentId);
        if (att) {
          filename = att.filename || filename;
          mimeType = att.mimeType || mimeType;
        }
      }

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(result.data);
    } catch (error: any) {
      console.error('Error downloading attachment:', error);
      res.status(500).json({ error: 'Failed to download attachment' });
    }
  });

  // GET /api/email/deal/:dealId/threads - Get email threads linked to a specific deal
  app.get('/api/email/deal/:dealId/threads', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal ID' });

      const isAdminUser = req.user!.role && ['admin', 'staff', 'super_admin'].includes(req.user!.role);
      if (!isAdminUser) {
        const [deal] = await db.select({ id: projects.id }).from(projects)
          .where(and(eq(projects.id, dealId), eq(projects.userId, req.user!.id)));
        if (!deal) return res.status(403).json({ error: 'Access denied' });
      }

      const links = await db.select({
        threadId: emailThreadDealLinks.threadId,
      }).from(emailThreadDealLinks)
        .where(eq(emailThreadDealLinks.dealId, dealId));

      if (links.length === 0) return res.json({ threads: [] });

      const threadIds = links.map(l => l.threadId);
      const threads = await db.select()
        .from(emailThreads)
        .where(sql`${emailThreads.id} = ANY(${threadIds})`)
        .orderBy(desc(emailThreads.lastMessageAt));

      res.json({ threads });
    } catch (error: any) {
      console.error('Error fetching deal email threads:', error);
      res.status(500).json({ error: 'Failed to fetch deal email threads' });
    }
  });

  // GET /api/email/suggest-deals - Suggest deals based on email participants
  app.get('/api/email/suggest-deals', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { participants } = req.query;
      if (!participants) return res.json({ deals: [] });
      
      const emailList = (participants as string).split(',').map(e => e.trim().toLowerCase());
      
      const matchedUsers = await db.select({ id: users.id, email: users.email })
        .from(users)
        .where(sql`LOWER(${users.email}) = ANY(${emailList})`);
      
      if (matchedUsers.length === 0) return res.json({ deals: [] });
      
      const userIds = matchedUsers.map(u => u.id);
      const deals = await db.select({
        id: projects.id,
        borrowerName: projects.borrowerName,
        propertyAddress: projects.propertyAddress,
        status: projects.status,
      }).from(projects)
        .where(sql`${projects.userId} = ANY(${userIds})`)
        .orderBy(desc(projects.createdAt))
        .limit(10);
      
      res.json({ deals });
    } catch (error: any) {
      console.error('Error suggesting deals:', error);
      res.status(500).json({ error: 'Failed to suggest deals' });
    }
  });
}

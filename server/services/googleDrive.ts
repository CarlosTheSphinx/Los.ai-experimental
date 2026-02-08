import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db';
import { users, projects, projectDocuments, savedQuotes, systemSettings, dealDocuments } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { Readable } from 'stream';

async function getAdminWithDriveTokens(): Promise<{ id: number; googleRefreshToken: string; googleAccessToken: string | null; googleTokenExpiresAt: Date | null } | null> {
  const [admin] = await db.select({
    id: users.id,
    googleRefreshToken: users.googleRefreshToken,
    googleAccessToken: users.googleAccessToken,
    googleTokenExpiresAt: users.googleTokenExpiresAt,
  })
    .from(users)
    .where(
      and(
        eq(users.role, 'super_admin'),
        eq(users.isActive, true),
      )
    )
    .limit(1);

  if (!admin || !admin.googleRefreshToken) {
    const admins = await db.select({
      id: users.id,
      role: users.role,
      googleRefreshToken: users.googleRefreshToken,
      googleAccessToken: users.googleAccessToken,
      googleTokenExpiresAt: users.googleTokenExpiresAt,
    })
      .from(users)
      .where(eq(users.isActive, true))
      .limit(50);

    const adminWithToken = admins.find(a => a.googleRefreshToken && (a.role === 'super_admin' || a.role === 'admin'));
    if (!adminWithToken) return null;
    return { id: adminWithToken.id, googleRefreshToken: adminWithToken.googleRefreshToken!, googleAccessToken: adminWithToken.googleAccessToken, googleTokenExpiresAt: adminWithToken.googleTokenExpiresAt };
  }

  return admin;
}

function getDriveClient(refreshToken: string, accessToken?: string | null): drive_v3.Drive {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_DRIVE_NOT_CONNECTED: Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }

  const oauth2Client = new OAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken || undefined,
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

export async function getParentFolderId(): Promise<string | null> {
  const [setting] = await db.select()
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, 'google_drive_parent_folder_id'))
    .limit(1);

  return setting?.settingValue || null;
}

export async function isDriveIntegrationEnabled(): Promise<boolean> {
  const parentFolderId = await getParentFolderId();
  if (!parentFolderId) return false;

  const admin = await getAdminWithDriveTokens();
  return !!admin;
}

async function createDriveFolder(folderName: string): Promise<{ folderId: string; webViewLink: string }> {
  const parentFolderId = await getParentFolderId();
  if (!parentFolderId) {
    throw new Error('GOOGLE_DRIVE_NOT_CONFIGURED: No parentFolderId configured in system settings');
  }

  const admin = await getAdminWithDriveTokens();
  if (!admin) {
    throw new Error('GOOGLE_DRIVE_NOT_CONNECTED: No admin with Google Drive tokens found. An admin must log in with Google first.');
  }

  const drive = getDriveClient(admin.googleRefreshToken, admin.googleAccessToken);

  const response = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  const folderId = response.data.id;
  const webViewLink = response.data.webViewLink;

  if (!folderId || !webViewLink) {
    throw new Error('GOOGLE_DRIVE_ERROR: Failed to create folder - missing id or webViewLink in response');
  }

  return { folderId, webViewLink };
}

export async function createProjectFolder({
  projectName,
  projectId,
}: {
  projectName: string;
  projectId: number;
}): Promise<{ folderId: string; webViewLink: string }> {
  const parentFolderId = await getParentFolderId();
  if (!parentFolderId) {
    throw new Error('GOOGLE_DRIVE_NOT_CONFIGURED: No parentFolderId configured in system settings');
  }

  const admin = await getAdminWithDriveTokens();
  if (!admin) {
    throw new Error('GOOGLE_DRIVE_NOT_CONNECTED: No admin with Google Drive tokens found. An admin must log in with Google first.');
  }

  const drive = getDriveClient(admin.googleRefreshToken, admin.googleAccessToken);

  const folderName = `${projectName} - ${projectId}`;

  const response = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  const folderId = response.data.id;
  const webViewLink = response.data.webViewLink;

  if (!folderId || !webViewLink) {
    throw new Error('GOOGLE_DRIVE_ERROR: Failed to create folder - missing id or webViewLink in response');
  }

  return { folderId, webViewLink };
}

export async function ensureProjectFolder(projectId: number): Promise<{
  googleDriveFolderId: string;
  googleDriveFolderUrl: string;
}> {
  const [project] = await db.select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  if (project.googleDriveFolderId && project.googleDriveFolderUrl) {
    return {
      googleDriveFolderId: project.googleDriveFolderId,
      googleDriveFolderUrl: project.googleDriveFolderUrl,
    };
  }

  await db.update(projects)
    .set({ driveSyncStatus: 'PENDING', driveSyncError: null })
    .where(eq(projects.id, projectId));

  try {
    const folderName = project.propertyAddress || project.projectName || `Project ${projectId}`;
    const { folderId, webViewLink } = await createDriveFolder(folderName);

    await db.update(projects)
      .set({
        googleDriveFolderId: folderId,
        googleDriveFolderUrl: webViewLink,
        driveSyncStatus: 'OK',
        driveSyncError: null,
      })
      .where(eq(projects.id, projectId));

    return {
      googleDriveFolderId: folderId,
      googleDriveFolderUrl: webViewLink,
    };
  } catch (error: any) {
    await db.update(projects)
      .set({
        driveSyncStatus: 'ERROR',
        driveSyncError: error.message || 'Unknown error creating folder',
      })
      .where(eq(projects.id, projectId));

    throw error;
  }
}

export async function ensureDealFolder(dealId: number): Promise<{
  googleDriveFolderId: string;
  googleDriveFolderUrl: string;
}> {
  const [deal] = await db.select()
    .from(savedQuotes)
    .where(eq(savedQuotes.id, dealId))
    .limit(1);

  if (!deal) {
    throw new Error(`Deal ${dealId} not found`);
  }

  if (deal.googleDriveFolderId && deal.googleDriveFolderUrl) {
    return {
      googleDriveFolderId: deal.googleDriveFolderId,
      googleDriveFolderUrl: deal.googleDriveFolderUrl,
    };
  }

  await db.update(savedQuotes)
    .set({ driveSyncStatus: 'PENDING', driveSyncError: null })
    .where(eq(savedQuotes.id, dealId));

  try {
    const folderName = deal.propertyAddress || `Deal ${dealId}`;
    const { folderId, webViewLink } = await createDriveFolder(folderName);

    await db.update(savedQuotes)
      .set({
        googleDriveFolderId: folderId,
        googleDriveFolderUrl: webViewLink,
        driveSyncStatus: 'OK',
        driveSyncError: null,
      })
      .where(eq(savedQuotes.id, dealId));

    return {
      googleDriveFolderId: folderId,
      googleDriveFolderUrl: webViewLink,
    };
  } catch (error: any) {
    await db.update(savedQuotes)
      .set({
        driveSyncStatus: 'ERROR',
        driveSyncError: error.message || 'Unknown error creating folder',
      })
      .where(eq(savedQuotes.id, dealId));

    throw error;
  }
}

export async function uploadFileToProjectFolder({
  projectId,
  fileStream,
  originalName,
  mimeType,
}: {
  projectId: number;
  fileStream: Readable;
  originalName: string;
  mimeType: string;
}): Promise<{ fileId: string; webViewLink: string }> {
  const { googleDriveFolderId } = await ensureProjectFolder(projectId);

  const admin = await getAdminWithDriveTokens();
  if (!admin) {
    throw new Error('GOOGLE_DRIVE_NOT_CONNECTED: No admin with Google Drive tokens found.');
  }

  const drive = getDriveClient(admin.googleRefreshToken, admin.googleAccessToken);

  const response = await drive.files.create({
    requestBody: {
      name: originalName,
      parents: [googleDriveFolderId],
    },
    media: {
      mimeType,
      body: fileStream,
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });

  const fileId = response.data.id;
  const webViewLink = response.data.webViewLink;

  if (!fileId || !webViewLink) {
    throw new Error('GOOGLE_DRIVE_ERROR: Failed to upload file - missing id or webViewLink in response');
  }

  return { fileId, webViewLink };
}

export async function syncDocumentToDrive(documentId: number): Promise<void> {
  const [doc] = await db.select()
    .from(projectDocuments)
    .where(eq(projectDocuments.id, documentId))
    .limit(1);

  if (!doc || !doc.filePath) {
    throw new Error(`Document ${documentId} not found or has no file`);
  }

  await db.update(projectDocuments)
    .set({ driveUploadStatus: 'PENDING', driveUploadError: null })
    .where(eq(projectDocuments.id, documentId));

  try {
    const { ObjectStorageService } = await import('../replit_integrations/object_storage/objectStorage');
    const objectStorageService = new ObjectStorageService();
    const objectFile = await objectStorageService.getObjectEntityFile(doc.filePath);
    const fileStream = objectFile.createReadStream();

    const mimeType = doc.documentType === 'pdf' ? 'application/pdf' : 'application/octet-stream';

    const { fileId, webViewLink } = await uploadFileToProjectFolder({
      projectId: doc.projectId,
      fileStream,
      originalName: doc.documentName,
      mimeType,
    });

    await db.update(projectDocuments)
      .set({
        googleDriveFileId: fileId,
        googleDriveFileUrl: webViewLink,
        googleDriveMimeType: mimeType,
        driveUploadStatus: 'OK',
        driveUploadError: null,
      })
      .where(eq(projectDocuments.id, documentId));
  } catch (error: any) {
    await db.update(projectDocuments)
      .set({
        driveUploadStatus: 'ERROR',
        driveUploadError: error.message || 'Unknown error uploading to Drive',
      })
      .where(eq(projectDocuments.id, documentId));

    throw error;
  }
}

export async function syncDealDocumentToDrive(docId: number): Promise<void> {
  const [doc] = await db.select()
    .from(dealDocuments)
    .where(eq(dealDocuments.id, docId))
    .limit(1);

  if (!doc || !doc.filePath) {
    throw new Error(`Deal document ${docId} not found or has no file`);
  }

  await db.update(dealDocuments)
    .set({ driveUploadStatus: 'PENDING', driveUploadError: null })
    .where(eq(dealDocuments.id, docId));

  try {
    const { ObjectStorageService } = await import('../replit_integrations/object_storage/objectStorage');
    const objectStorageService = new ObjectStorageService();
    const objectFile = await objectStorageService.getObjectEntityFile(doc.filePath);
    const fileStream = objectFile.createReadStream();

    const mimeType = doc.mimeType || 'application/octet-stream';

    const { googleDriveFolderId } = await ensureDealFolder(doc.dealId);

    const admin = await getAdminWithDriveTokens();
    if (!admin) {
      throw new Error('GOOGLE_DRIVE_NOT_CONNECTED: No admin with Google Drive tokens found.');
    }

    const drive = getDriveClient(admin.googleRefreshToken, admin.googleAccessToken);

    const response = await drive.files.create({
      requestBody: {
        name: doc.fileName || doc.documentName,
        parents: [googleDriveFolderId],
      },
      media: {
        mimeType,
        body: fileStream,
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });

    const fileId = response.data.id;
    const webViewLink = response.data.webViewLink;

    if (!fileId || !webViewLink) {
      throw new Error('GOOGLE_DRIVE_ERROR: Failed to upload file - missing id or webViewLink');
    }

    await db.update(dealDocuments)
      .set({
        googleDriveFileId: fileId,
        googleDriveFileUrl: webViewLink,
        driveUploadStatus: 'OK',
        driveUploadError: null,
      })
      .where(eq(dealDocuments.id, docId));
  } catch (error: any) {
    await db.update(dealDocuments)
      .set({
        driveUploadStatus: 'ERROR',
        driveUploadError: error.message || 'Unknown error uploading to Drive',
      })
      .where(eq(dealDocuments.id, docId));

    throw error;
  }
}

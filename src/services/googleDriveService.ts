/**
 * Google Drive Integration Service
 * Uses Google Drive REST API v3 with scope: https://www.googleapis.com/auth/drive.file
 * Conforms to Google Identity Services (GSI) client-side token acquisition guidelines.
 */

export interface GoogleUserInfo {
  sub: string;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email: string;
  email_verified?: boolean;
}

export interface GoogleDriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  size?: string;
  webViewLink?: string;
}

export interface BackupDataPackage {
  appVersion: string;
  exportTimestamp: string;
  schoolProfile: Record<string, unknown>;
  personnelCount: number;
  personnel: unknown[];
  schools: unknown[];
  auditLogsCount: number;
  auditLogs: unknown[];
  systemMetadata: {
    author: string;
    role: string;
    division: string;
    schoolLocation: string;
  };
}

const DRIVE_FOLDER_NAME = 'DepEd AO II Portal Backups';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

// In-memory token cache (never stored in localStorage)
let cachedAccessToken: string | null = null;

export function setCachedGoogleToken(token: string | null) {
  cachedAccessToken = token;
}

export function getCachedGoogleToken(): string | null {
  return cachedAccessToken;
}

/**
 * Fetch authenticated Google User Profile info
 */
export async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Google profile: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as GoogleUserInfo;
}

/**
 * Find or create the dedicated 'DepEd AO II Portal Backups' folder in user's Google Drive
 */
export async function getOrCreateBackupsFolder(accessToken: string): Promise<string> {
  // Query for existing folder
  const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${DRIVE_FOLDER_NAME}' and trashed=false`);
  const searchRes = await fetch(`${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name)&spaces=drive`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  }

  // Create folder if not found
  const createRes = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Automated and manual database snapshots from DepEd AO II Operations Portal',
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Could not create Google Drive folder: ${errText}`);
  }

  const folderData = await createRes.json();
  return folderData.id;
}

/**
 * Upload a JSON database snapshot into user's Google Drive
 */
export async function uploadBackupToGoogleDrive(
  accessToken: string,
  backupData: BackupDataPackage,
  customFileName?: string
): Promise<GoogleDriveFileMeta> {
  const folderId = await getOrCreateBackupsFolder(accessToken);

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rawSchoolName = (backupData.schoolProfile?.schoolName as string) || 'School';
  const cleanSchoolName = rawSchoolName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
  const fileName = customFileName || `DepEd_AOII_Backup_${cleanSchoolName}_${timestampStr}.json`;

  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    parents: [folderId],
    description: `DepEd AO II Portal database backup created on ${new Date().toLocaleString('en-PH')}`,
  };

  const fileContentString = JSON.stringify(backupData, null, 2);
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContentString +
    closeDelimiter;

  const uploadRes = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,createdTime,size,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Failed to upload backup to Google Drive: ${errText}`);
  }

  return (await uploadRes.json()) as GoogleDriveFileMeta;
}

/**
 * List all backup files stored in the 'DepEd AO II Portal Backups' Google Drive folder
 */
export async function listGoogleDriveBackups(accessToken: string): Promise<GoogleDriveFileMeta[]> {
  try {
    const folderId = await getOrCreateBackupsFolder(accessToken);
    const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const res = await fetch(
      `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,mimeType,createdTime,size,webViewLink)&orderBy=createdTime desc&pageSize=30`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to query Google Drive backups: ${res.statusText}`);
    }

    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.warn('Could not list Google Drive backups:', err);
    return [];
  }
}

/**
 * Download a backup file from Google Drive by its fileId
 */
export async function downloadGoogleDriveBackup(
  accessToken: string,
  fileId: string
): Promise<BackupDataPackage> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to download file from Google Drive: ${res.statusText}`);
  }

  return (await res.json()) as BackupDataPackage;
}

/**
 * Export any arbitrary file (CSV, Form 48 DTR, etc.) to the Google Drive folder
 */
export async function exportArbitraryFileToGoogleDrive(
  accessToken: string,
  fileName: string,
  mimeType: string,
  content: string
): Promise<GoogleDriveFileMeta> {
  const folderId = await getOrCreateBackupsFolder(accessToken);

  const metadata = {
    name: fileName,
    mimeType: mimeType,
    parents: [folderId],
  };

  const boundary = '-------deped_aoii_boundary_upload';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n\r\n` +
    content +
    closeDelimiter;

  const uploadRes = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,createdTime,size,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!uploadRes.ok) {
    throw new Error(`Failed to upload ${fileName} to Google Drive: ${uploadRes.statusText}`);
  }

  return (await uploadRes.json()) as GoogleDriveFileMeta;
}

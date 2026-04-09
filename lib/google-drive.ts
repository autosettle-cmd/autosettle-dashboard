import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'fs';
import { prisma } from './prisma';

// ─── Auth ──────────────────────────────────────────────────────────────────

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

let authClient: GoogleAuth | null = null;

function getAuthClient(): GoogleAuth {
  if (!authClient) {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath) {
      const credentials = JSON.parse(readFileSync(keyPath, 'utf-8'));
      authClient = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] });
    } else {
      let rawJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}').trim();
      // Strip outer quotes if Vercel wrapped the value
      if (rawJson.startsWith('"') && rawJson.endsWith('"')) {
        rawJson = rawJson.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
      const credentials = JSON.parse(rawJson);
      authClient = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] });
    }
  }
  return authClient;
}

async function getAccessToken(): Promise<string> {
  const client = await getAuthClient().getClient();
  const token = await client.getAccessToken();
  return token.token!;
}

// ─── URL Helpers ───────────────────────────────────────────────────────────

export function getThumbnailUrl(fileId: string): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
}

export function getDriveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function getDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// ─── Folder Management ─────────────────────────────────────────────────────

async function createDriveFolder(name: string, parentFolderId: string): Promise<string> {
  const accessToken = await getAccessToken();

  const res = await fetch(`${DRIVE_FILES_URL}?supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive folder creation failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

type DocType = 'claims' | 'invoices' | 'bank_statements';

const DOC_TYPE_LABELS: Record<DocType, string> = {
  claims: 'Claims',
  invoices: 'Invoices',
  bank_statements: 'Bank Statements',
};

const DOC_TYPE_COLUMNS: Record<DocType, 'drive_claims_folder_id' | 'drive_invoices_folder_id' | 'drive_bank_statements_folder_id'> = {
  claims: 'drive_claims_folder_id',
  invoices: 'drive_invoices_folder_id',
  bank_statements: 'drive_bank_statements_folder_id',
};

async function getOrCreateRootFolder(firmId: string, firmName: string): Promise<string> {
  const firm = await prisma.firm.findUniqueOrThrow({
    where: { id: firmId },
    select: { drive_root_folder_id: true },
  });

  if (firm.drive_root_folder_id) return firm.drive_root_folder_id;

  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set');

  const newFolderId = await createDriveFolder(firmName, rootFolderId);

  // Atomic update — handles race condition
  const updated = await prisma.firm.updateMany({
    where: { id: firmId, drive_root_folder_id: null },
    data: { drive_root_folder_id: newFolderId },
  });

  if (updated.count === 0) {
    // Another request already set it — re-read
    const refreshed = await prisma.firm.findUniqueOrThrow({
      where: { id: firmId },
      select: { drive_root_folder_id: true },
    });
    return refreshed.drive_root_folder_id!;
  }

  return newFolderId;
}

export async function getOrCreateDocTypeFolder(
  firmId: string,
  firmName: string,
  docType: DocType
): Promise<string> {
  const column = DOC_TYPE_COLUMNS[docType];
  const firm = await prisma.firm.findUniqueOrThrow({
    where: { id: firmId },
    select: { [column]: true },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingId = (firm as any)[column];
  if (existingId) return existingId;

  // Ensure firm root folder exists
  const firmFolderId = await getOrCreateRootFolder(firmId, firmName);

  // Create doc type subfolder
  const label = DOC_TYPE_LABELS[docType];
  const newFolderId = await createDriveFolder(label, firmFolderId);

  // Atomic update
  const updated = await prisma.firm.updateMany({
    where: { id: firmId, [column]: null },
    data: { [column]: newFolderId },
  });

  if (updated.count === 0) {
    const refreshed = await prisma.firm.findUniqueOrThrow({
      where: { id: firmId },
      select: { [column]: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (refreshed as any)[column]!;
  }

  return newFolderId;
}

// ─── Upload Functions ──────────────────────────────────────────────────────

/**
 * Core upload — uploads a buffer to Google Drive.
 * If folderId is not provided, falls back to GOOGLE_DRIVE_FOLDER_ID (backward compat).
 */
export async function uploadToDrive(
  imageBuffer: Buffer,
  filename: string,
  mimeType: string = 'image/jpeg',
  folderId?: string
): Promise<{ fileId: string; thumbnailUrl: string }> {
  const targetFolder = folderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!targetFolder) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set');

  const accessToken = await getAccessToken();

  const metadata = { name: filename, parents: [targetFolder] };
  const boundary = 'autosettle_boundary';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { id: string };
  const fileId = data.id;

  // Make file publicly viewable (best-effort — Shared Drives may block this)
  try {
    await fetch(
      `${DRIVE_FILES_URL}/${fileId}/permissions?supportsAllDrives=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }
    );
  } catch (e) {
    console.warn('Could not set public permission (Shared Drive may restrict this):', e);
  }

  return { fileId, thumbnailUrl: getThumbnailUrl(fileId) };
}

/**
 * High-level upload — resolves the correct firm/docType folder, then uploads.
 */
export async function uploadToDriveForFirm(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  firmId: string,
  firmName: string,
  docType: DocType
): Promise<{ fileId: string; thumbnailUrl: string }> {
  const folderId = await getOrCreateDocTypeFolder(firmId, firmName, docType);
  return uploadToDrive(buffer, filename, mimeType, folderId);
}

/**
 * Dashboard upload helper — converts File to Buffer, uploads to firm folder.
 * Replaces the duplicated uploadToGoogleDrive() in dashboard API routes.
 */
export async function uploadFileForFirm(
  file: File,
  firmId: string,
  firmName: string,
  docType: DocType
): Promise<{ fileUrl: string; downloadUrl: string; thumbnailUrl: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const { fileId } = await uploadToDriveForFirm(buffer, file.name, file.type, firmId, firmName, docType);

  return {
    fileUrl: getDriveViewUrl(fileId),
    downloadUrl: getDriveDownloadUrl(fileId),
    thumbnailUrl: getThumbnailUrl(fileId),
  };
}

import { GoogleAuth } from "google-auth-library";
import { readFileSync } from "fs";

const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";

let authClient: GoogleAuth | null = null;

function getAuthClient(): GoogleAuth {
  if (!authClient) {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath) {
      const credentials = JSON.parse(readFileSync(keyPath, "utf-8"));
      authClient = new GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/drive"],
      });
    } else {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
      authClient = new GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/drive"],
      });
    }
  }
  return authClient;
}

async function getAccessToken(): Promise<string> {
  const client = await getAuthClient().getClient();
  const token = await client.getAccessToken();
  return token.token!;
}

export async function uploadToDrive(
  imageBuffer: Buffer,
  filename: string,
  mimeType: string = "image/jpeg"
): Promise<{ fileId: string; thumbnailUrl: string }> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID not set");

  const accessToken = await getAccessToken();

  const metadata = {
    name: filename,
    parents: [folderId],
  };

  const boundary = "autosettle_boundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(DRIVE_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { id: string };
  const fileId = data.id;

  // Make file publicly viewable so thumbnail URL works
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    }
  );

  return {
    fileId,
    thumbnailUrl: getThumbnailUrl(fileId),
  };
}

export function getThumbnailUrl(fileId: string): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
}

export function getDriveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

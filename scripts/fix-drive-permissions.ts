import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { GoogleAuth } from "google-auth-library";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

function getAuthClient(): GoogleAuth {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (keyPath) {
    const credentials = JSON.parse(readFileSync(keyPath, "utf-8"));
    return new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
  }
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
  return new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
}

async function main() {
  const auth = getAuthClient();
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const accessToken = token.token!;

  // Get all claims with a file_url containing a Drive file ID
  const claims = await prisma.claim.findMany({
    where: { file_url: { not: null } },
    select: { id: true, file_url: true },
  });

  console.log(`Found ${claims.length} claims with file URLs`);

  let success = 0;
  let failed = 0;

  for (const claim of claims) {
    const match = claim.file_url?.match(/\/d\/([^/]+)\//);
    if (!match) {
      console.log(`  Skip claim ${claim.id} — no Drive file ID in URL`);
      continue;
    }

    const fileId = match[1];
    const res = await fetch(
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

    if (res.ok) {
      success++;
      console.log(`  ✓ ${fileId}`);
    } else {
      failed++;
      const text = await res.text();
      console.log(`  ✗ ${fileId}: ${res.status} ${text}`);
    }
  }


  console.log(`\nDone: ${success} updated, ${failed} failed`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

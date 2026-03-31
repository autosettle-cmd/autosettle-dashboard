const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

/**
 * Download any media from WhatsApp Cloud API by media ID.
 * Works for images, documents (PDFs), audio, etc.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<Buffer> {
  const token = process.env.WHATSAPP_TOKEN!;
  const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`Failed to get media URL: ${metaRes.status}`);
  const metaJson = (await metaRes.json()) as { url: string };
  const mediaRes = await fetch(metaJson.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!mediaRes.ok) throw new Error(`Failed to download media: ${mediaRes.status}`);
  return Buffer.from(await mediaRes.arrayBuffer());
}

/**
 * Download image from WhatsApp Cloud API by media ID.
 * Two-step: get URL, then fetch binary.
 */
export async function downloadWhatsAppImage(imageId: string): Promise<Buffer> {
  const token = process.env.WHATSAPP_TOKEN!;

  // Step 1: Get the download URL
  const metaRes = await fetch(`https://graph.facebook.com/v22.0/${imageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    throw new Error(`Failed to get image URL: ${metaRes.status} ${metaRes.statusText}`);
  }

  const metaJson = (await metaRes.json()) as { url: string };

  // Step 2: Download the actual image binary
  const imageRes = await fetch(metaJson.url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!imageRes.ok) {
    throw new Error(`Failed to download image: ${imageRes.status} ${imageRes.statusText}`);
  }

  const arrayBuffer = await imageRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Run Google Cloud Vision TEXT_DETECTION on an image buffer.
 * Returns the raw OCR text.
 */
export async function runOCR(imageBuffer: Buffer): Promise<string> {
  const base64Image = imageBuffer.toString("base64");
  const apiKey = process.env.GOOGLE_VISION_API_KEY;

  const url = apiKey
    ? `${VISION_API_URL}?key=${apiKey}`
    : VISION_API_URL;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Use service account token if no API key
  if (!apiKey && process.env.GOOGLE_ACCESS_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: "TEXT_DETECTION" }],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Vision API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as {
    responses: Array<{
      fullTextAnnotation?: { text: string };
    }>;
  };

  const text = json.responses?.[0]?.fullTextAnnotation?.text;
  if (!text) {
    throw new Error("No text detected in image");
  }

  return text;
}

/**
 * Normalise raw OCR text before sending to Gemini.
 * - Remove excessive whitespace and blank lines
 * - Trim to max 3000 characters
 * - Keep numbers, dates, merchant names intact
 */
export function normaliseOCRText(raw: string): string {
  return raw
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, 3000);
}

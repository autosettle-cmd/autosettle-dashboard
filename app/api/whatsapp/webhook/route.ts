import { NextRequest, NextResponse } from "next/server";
import { lookupEmployeeByPhone, EmployeeInfo } from "@/lib/whatsapp/employees";
import { sendTextMessage, sendInteractiveMenu, sendReaction, sendConfirmationMessage, sendInteractiveButtons } from "@/lib/whatsapp/send";
import { downloadWhatsAppImage, runOCR, normaliseOCRText } from "@/lib/whatsapp/ocr";
import { extractWithGemini } from "@/lib/whatsapp/gemini";
import { parseGeminiOutput } from "@/lib/whatsapp/parser";
import { uploadToDrive } from "@/lib/whatsapp/drive";
import { saveClaim, logMessage, getClaimsForPhone } from "@/lib/whatsapp/claims";
import { getSession, createSession, updateSession, deleteSession } from "@/lib/whatsapp/session";
import { handleLisa } from "@/lib/whatsapp/lisa";
import { sendTelegramAlert } from "@/lib/whatsapp/errorNotify";
import { prisma } from "@/lib/prisma";

const UNREGISTERED_MESSAGE =
  "Hi there! It looks like your number isn't registered with any of our services yet. To get started, please reach out to us at: jeffrylau@auto-settle.com or +6012-345-8661";

// GET — Meta webhook verification (one-time setup)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// POST — Incoming WhatsApp messages from Meta
export async function POST(request: NextRequest) {
  // Always return 200 immediately to Meta — process async
  const body = await request.json();

  // Fire-and-forget: process in background, return 200 now
  processWebhook(body).catch((err) => {
    console.error("[WhatsApp Webhook] Unhandled error:", err);
    sendTelegramAlert({ error: err, context: { location: "processWebhook" } });
  });

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

async function processWebhook(body: Record<string, unknown>) {
  const entry = body.entry as Array<Record<string, unknown>> | undefined;
  if (!entry || entry.length === 0) return;

  const changes = entry[0].changes as Array<Record<string, unknown>> | undefined;
  if (!changes || changes.length === 0) return;

  const value = changes[0].value as Record<string, unknown>;
  const messages = value.messages as Array<Record<string, unknown>> | undefined;

  // Drop non-message events (delivery receipts, read receipts, status updates)
  if (!messages || messages.length === 0) return;

  const message = messages[0];
  const phone = message.from as string;

  // Look up employee by phone
  const employee = await lookupEmployeeByPhone(phone);

  if (!employee) {
    console.log(`[WhatsApp] Unregistered phone: ${phone} — sending registration prompt`);
    await sendTextMessage(phone, UNREGISTERED_MESSAGE);
    return;
  }

  // Route based on message type
  await routeMessage(message, phone, employee);
}

async function routeMessage(
  message: Record<string, unknown>,
  phone: string,
  employee: EmployeeInfo
) {
  const messageType = message.type as string;

  switch (messageType) {
    case "image":
      await handleImageMessage(message, phone, employee);
      break;

    case "interactive":
      await handleInteractiveMessage(message, phone, employee);
      break;

    case "text": {
      const textBody = (message.text as { body: string })?.body || "";
      console.log(`[WhatsApp] Text message from ${phone}: "${textBody}"`);
      const session = await getSession(phone);
      await handleLisa(phone, employee, session, textBody);
      break;
    }

    default:
      // Ignore unsupported message types
      break;
  }
}

async function handleImageMessage(
  message: Record<string, unknown>,
  phone: string,
  employee: EmployeeInfo
) {
  const startTime = Date.now();
  const messageId = message.id as string | undefined;
  const image = message.image as { id: string } | undefined;
  if (!image?.id) {
    console.error(`[WhatsApp] Image message from ${phone} missing image.id`);
    return;
  }

  console.log(`[WhatsApp] Image received from ${phone} — starting OCR pipeline`);

  try {
    // Step 1: Download image from WhatsApp
    const imageBuffer = await downloadWhatsAppImage(image.id);
    console.log(`[WhatsApp] Image downloaded: ${imageBuffer.length} bytes`);

    // Step 2: Run OCR
    const rawText = await runOCR(imageBuffer);
    const ocrText = normaliseOCRText(rawText);
    console.log(`[WhatsApp] OCR text (${ocrText.length} chars):\n${ocrText.slice(0, 500)}`);

    // Step 3: Get firm categories
    const categories = await prisma.category.findMany({
      where: {
        OR: [
          { firm_id: employee.firmId, is_active: true },
          { firm_id: null, is_active: true },
        ],
      },
      select: { name: true },
    });
    const categoryNames = categories.map((c) => c.name);
    console.log(`[WhatsApp] Categories for firm ${employee.firmName}: ${categoryNames.join(", ")}`);

    // Step 4: Extract with Gemini
    const geminiRaw = await extractWithGemini(ocrText, categoryNames);
    console.log(`[WhatsApp] Gemini raw output: ${geminiRaw}`);

    // Step 5: Parse and validate
    const extracted = parseGeminiOutput(geminiRaw);
    console.log(`[WhatsApp] Extracted: ${JSON.stringify(extracted)}`);
    console.log(`[WhatsApp] Confidence: ${extracted.confidence}`);

    // Step 6: Confidence routing
    if (extracted.confidence === "HIGH" || extracted.confidence === "MEDIUM") {
      // React with thumbs up
      if (messageId) {
        await sendReaction(phone, messageId, "\ud83d\udc4d");
      }

      // Upload to Google Drive
      const filename = `${employee.name}_${extracted.date}_${extracted.merchant}.jpg`.replace(/\s+/g, "_");
      const { fileId, thumbnailUrl } = await uploadToDrive(imageBuffer, filename);
      console.log(`[WhatsApp] Uploaded to Drive: ${fileId}`);

      // Save to claims table
      await saveClaim({
        employeeId: employee.id,
        firmId: employee.firmId,
        claimDate: extracted.date,
        merchant: extracted.merchant,
        amount: extracted.amount,
        receiptNumber: extracted.receiptNumber,
        category: extracted.category,
        confidence: extracted.confidence,
        driveFileId: fileId,
        thumbnailUrl,
      });
      console.log(`[WhatsApp] Claim saved for ${phone}`);

      // Send confirmation message
      await sendConfirmationMessage(phone, {
        merchant: extracted.merchant,
        amount: extracted.amount,
        date: extracted.date,
        receiptNumber: extracted.receiptNumber,
        category: extracted.category,
      });
    } else {
      // LOW confidence — send buttons for confirmation
      const bodyText = [
        "Please check these details:",
        "",
        extracted.merchant || "(unknown merchant)",
        `RM${extracted.amount.toFixed(2)}`,
        extracted.date || "(unknown date)",
        extracted.receiptNumber || "-",
        extracted.category || "(unknown category)",
        "",
        "Is this correct?",
      ].join("\n");

      await sendInteractiveButtons(phone, bodyText, [
        { id: "confirm_yes", title: "Yes" },
        { id: "confirm_no", title: "No" },
      ]);

      // Create session with pending data for button handler
      const pendingData = {
        merchant: extracted.merchant,
        amount: extracted.amount,
        date: extracted.date,
        receiptNumber: extracted.receiptNumber,
        category: extracted.category,
        confidence: extracted.confidence,
        imageBuffer: Buffer.from(imageBuffer).toString("base64"),
        employeeId: employee.id,
        firmId: employee.firmId,
        employeeName: employee.name,
      };
      await createSession(phone, pendingData);
      console.log(`[WhatsApp] LOW confidence — session created, sent confirmation buttons to ${phone}`);
    }

    // Fire-and-forget: log message
    logMessage({
      phone,
      employeeId: employee.id,
      messageType: "image",
      ocrConfidence: extracted.confidence,
      processingMs: Date.now() - startTime,
    }).catch((err) => console.error("Log write failed silently:", err));
  } catch (err) {
    console.error(`[WhatsApp] Image processing error for ${phone}:`, err);

    sendTelegramAlert({
      error: err instanceof Error ? err : String(err),
      context: { location: "handleImageMessage", phone, messageType: "image" },
    });

    logMessage({
      phone,
      employeeId: employee.id,
      messageType: "image",
      error: err instanceof Error ? err.message : String(err),
      processingMs: Date.now() - startTime,
    }).catch((logErr) => console.error("Log write failed silently:", logErr));

    await sendTextMessage(phone, "Sorry, there was an error processing your receipt. Please try again.");
  }
}

async function handleInteractiveMessage(
  message: Record<string, unknown>,
  phone: string,
  employee: EmployeeInfo
) {
  const interactive = message.interactive as Record<string, unknown>;
  const buttonReply = interactive?.button_reply as { id: string; title: string } | undefined;
  const listReply = interactive?.list_reply as { id: string; title: string } | undefined;
  const buttonId = buttonReply?.id || listReply?.id;

  if (!buttonId) {
    console.log(`[WhatsApp] Interactive message from ${phone} — no button/list ID found`);
    return;
  }

  console.log(`[WhatsApp] Button pressed: ${buttonId} from ${phone}`);

  if (buttonId === "confirm_yes") {
    const session = await getSession(phone);
    if (!session || !session.pending_receipt) {
      await sendTextMessage(phone, "No pending receipt found. Please send a new receipt photo.");
      return;
    }

    const pending = session.pending_receipt as Record<string, unknown>;

    try {
      // Upload image to Drive from stored base64
      const imageBuffer = Buffer.from(pending.imageBuffer as string, "base64");
      const filename = `${pending.employeeName}_${pending.date}_${pending.merchant}.jpg`.replace(/\s+/g, "_");
      const { fileId, thumbnailUrl } = await uploadToDrive(imageBuffer, filename);
      console.log(`[WhatsApp] Uploaded to Drive: ${fileId}`);

      // Save claim
      await saveClaim({
        employeeId: pending.employeeId as string,
        firmId: pending.firmId as string,
        claimDate: pending.date as string,
        merchant: pending.merchant as string,
        amount: pending.amount as number,
        receiptNumber: pending.receiptNumber as string,
        category: pending.category as string,
        confidence: pending.confidence as "HIGH" | "MEDIUM" | "LOW",
        driveFileId: fileId,
        thumbnailUrl,
      });
      console.log(`[WhatsApp] Claim saved for ${phone}`);

      // Delete session
      await deleteSession(session.id);

      // Send confirmation
      await sendConfirmationMessage(phone, {
        merchant: pending.merchant as string,
        amount: pending.amount as number,
        date: pending.date as string,
        receiptNumber: pending.receiptNumber as string,
        category: pending.category as string,
      });

      // Fire-and-forget log
      logMessage({
        phone,
        employeeId: pending.employeeId as string,
        messageType: "interactive",
        ocrConfidence: pending.confidence as string,
      }).catch((err) => console.error("Log write failed silently:", err));
    } catch (err) {
      console.error(`[WhatsApp] confirm_yes error for ${phone}:`, err);
      sendTelegramAlert({
        error: err instanceof Error ? err : String(err),
        context: { location: "handleInteractiveMessage/confirm_yes", phone, messageType: "interactive" },
      });
      await sendTextMessage(phone, "Sorry, there was an error saving your receipt. Please try again.");
    }
  } else if (buttonId === "confirm_no") {
    const session = await getSession(phone);
    if (!session) {
      await sendTextMessage(phone, "No pending receipt found. Please send a new receipt photo.");
      return;
    }

    // Update session to AWAITING_CORRECTION
    await updateSession(session.id, { step: "AWAITING_CORRECTION" });

    await sendTextMessage(
      phone,
      "What needs to be corrected? Type the correction and I'll update it."
    );
    console.log(`[WhatsApp] Session ${session.id} set to AWAITING_CORRECTION for ${phone}`);
  } else if (buttonId === "menu_submit") {
    await sendTextMessage(phone, "Send a photo of your receipt and I'll process it for you.");
  } else if (buttonId === "menu_status") {
    const statusMsg = await getClaimsForPhone(phone, "pending");
    await sendTextMessage(phone, statusMsg);
  } else if (buttonId === "menu_summary") {
    const summaryMsg = await getClaimsForPhone(phone, "all");
    await sendTextMessage(phone, summaryMsg);
  } else if (buttonId === "menu_help") {
    await sendTextMessage(phone, "Just send a photo of your receipt and I'll extract the details automatically. You can also type 'status' or 'summary' anytime.");
  }
}

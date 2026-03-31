import { NextRequest, NextResponse } from "next/server";
import { lookupEmployeeByPhone, EmployeeInfo } from "@/lib/whatsapp/employees";
import { sendTextMessage, sendReaction, sendConfirmationMessage, sendInvoiceConfirmationMessage, sendInteractiveButtons } from "@/lib/whatsapp/send";
import { downloadWhatsAppImage, downloadWhatsAppMedia, runOCR, normaliseOCRText } from "@/lib/whatsapp/ocr";
import { extractWithGemini, extractWithGeminiInvoice, classifyDocument, extractInvoiceFromPDF } from "@/lib/whatsapp/gemini";
import { parseGeminiOutput, parseGeminiInvoiceOutput } from "@/lib/whatsapp/parser";
import { uploadToDrive } from "@/lib/whatsapp/drive";
import { saveClaim, logMessage, getClaimsForPhone } from "@/lib/whatsapp/claims";
import { saveInvoice } from "@/lib/whatsapp/invoices";
import { getSession, addPendingReceipt, removePendingReceipt, generateReceiptKey, updateSession } from "@/lib/whatsapp/session";
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

    case "document":
      await handleDocumentMessage(message, phone, employee);
      break;

    case "interactive":
      await handleInteractiveMessage(message, phone);
      break;

    case "text": {
      const textBody = (message.text as { body: string })?.body || "";
      console.log(`[WhatsApp] Text message from ${phone}: "${textBody}"`);
      const session = await getSession(phone);

      // If session is COLLECTING but NOT awaiting correction, tell user to use buttons
      if (
        session?.state === "COLLECTING" &&
        !session.step?.startsWith("AWAITING_CORRECTION:")
      ) {
        await sendTextMessage(phone, "Please use the Yes or No buttons above to confirm your receipt.");
        break;
      }

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

    // Step 4: Admin → classify document type; Employee → always claim
    const isAdmin = employee.role === "admin";
    const docType = isAdmin ? await classifyDocument(ocrText) : "receipt" as const;
    console.log(`[WhatsApp] Role: ${employee.role}, Document type: ${docType}`);

    if (docType === "invoice") {
      // ── Invoice flow (admin only) ──────────────────────────────
      const geminiRaw = await extractWithGeminiInvoice(ocrText, categoryNames);
      console.log(`[WhatsApp] Gemini invoice raw: ${geminiRaw}`);

      const extracted = parseGeminiInvoiceOutput(geminiRaw);
      console.log(`[WhatsApp] Invoice extracted: ${JSON.stringify(extracted)}`);

      if (extracted.confidence === "HIGH" || extracted.confidence === "MEDIUM") {
        if (messageId) await sendReaction(phone, messageId, "\ud83d\udc4d");

        const filename = `INV_${employee.name}_${extracted.issueDate}_${extracted.vendor}.jpg`.replace(/\s+/g, "_");
        const { fileId, thumbnailUrl } = await uploadToDrive(imageBuffer, filename);
        console.log(`[WhatsApp] Uploaded invoice to Drive: ${fileId}`);

        await saveInvoice({
          employeeId: employee.id,
          firmId: employee.firmId,
          vendor: extracted.vendor,
          invoiceNumber: extracted.invoiceNumber,
          issueDate: extracted.issueDate,
          dueDate: extracted.dueDate,
          paymentTerms: extracted.paymentTerms,
          subtotal: extracted.subtotal,
          taxAmount: extracted.taxAmount,
          totalAmount: extracted.totalAmount,
          category: extracted.category,
          confidence: extracted.confidence,
          driveFileId: fileId,
          thumbnailUrl,
        });
        console.log(`[WhatsApp] Invoice saved for ${phone}`);

        await sendInvoiceConfirmationMessage(phone, {
          vendor: extracted.vendor,
          totalAmount: extracted.totalAmount,
          issueDate: extracted.issueDate,
          dueDate: extracted.dueDate,
          invoiceNumber: extracted.invoiceNumber,
          category: extracted.category,
        });
      } else {
        // LOW confidence invoice — send confirmation buttons
        const receiptKey = generateReceiptKey();

        const bodyText = [
          "Please check this invoice:",
          "",
          `Vendor: ${extracted.vendor || "(unknown)"}`,
          `Amount: RM${extracted.totalAmount.toFixed(2)}`,
          `Issue Date: ${extracted.issueDate || "(unknown)"}`,
          `Due Date: ${extracted.dueDate || "-"}`,
          `Invoice No: ${extracted.invoiceNumber || "-"}`,
          `Category: ${extracted.category || "(unknown)"}`,
          "",
          "Is this correct?",
        ].join("\n");

        await sendInteractiveButtons(phone, bodyText, [
          { id: `confirm_yes:${receiptKey}`, title: "Yes" },
          { id: `confirm_no:${receiptKey}`, title: "No" },
        ]);

        const pendingData = {
          type: "invoice",
          vendor: extracted.vendor,
          invoiceNumber: extracted.invoiceNumber,
          issueDate: extracted.issueDate,
          dueDate: extracted.dueDate,
          paymentTerms: extracted.paymentTerms,
          subtotal: extracted.subtotal,
          taxAmount: extracted.taxAmount,
          totalAmount: extracted.totalAmount,
          category: extracted.category,
          confidence: extracted.confidence,
          imageBuffer: Buffer.from(imageBuffer).toString("base64"),
          employeeId: employee.id,
          firmId: employee.firmId,
          employeeName: employee.name,
        };
        await addPendingReceipt(phone, receiptKey, pendingData);
        console.log(`[WhatsApp] LOW confidence invoice ${receiptKey} added to pending map for ${phone}`);
      }

      logMessage({
        phone, employeeId: employee.id, messageType: "image",
        ocrConfidence: extracted.confidence, processingMs: Date.now() - startTime,
      }).catch((err) => console.error("Log write failed silently:", err));

    } else {
      // ── Receipt/Claim flow ─────────────────────────────────────
      const geminiRaw = await extractWithGemini(ocrText, categoryNames);
      console.log(`[WhatsApp] Gemini raw output: ${geminiRaw}`);

      const extracted = parseGeminiOutput(geminiRaw);
      console.log(`[WhatsApp] Extracted: ${JSON.stringify(extracted)}`);
      console.log(`[WhatsApp] Confidence: ${extracted.confidence}`);

      if (extracted.confidence === "HIGH" || extracted.confidence === "MEDIUM") {
        if (messageId) {
          await sendReaction(phone, messageId, "\ud83d\udc4d");
        }

        const filename = `${employee.name}_${extracted.date}_${extracted.merchant}.jpg`.replace(/\s+/g, "_");
        const { fileId, thumbnailUrl } = await uploadToDrive(imageBuffer, filename);
        console.log(`[WhatsApp] Uploaded to Drive: ${fileId}`);

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

        await sendConfirmationMessage(phone, {
          merchant: extracted.merchant,
          amount: extracted.amount,
          date: extracted.date,
          receiptNumber: extracted.receiptNumber,
          category: extracted.category,
        });
      } else {
        const receiptKey = generateReceiptKey();

        const bodyText = [
          "Please check these details:",
          "",
          `Merchant: ${extracted.merchant || "(unknown)"}`,
          `Amount: RM${extracted.amount.toFixed(2)}`,
          `Date: ${extracted.date || "(unknown)"}`,
          `Receipt No: ${extracted.receiptNumber || "-"}`,
          `Category: ${extracted.category || "(unknown)"}`,
          "",
          "Is this correct?",
        ].join("\n");

        await sendInteractiveButtons(phone, bodyText, [
          { id: `confirm_yes:${receiptKey}`, title: "Yes" },
          { id: `confirm_no:${receiptKey}`, title: "No" },
        ]);

        const pendingData = {
          type: "receipt",
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
        await addPendingReceipt(phone, receiptKey, pendingData);
        console.log(`[WhatsApp] LOW confidence receipt ${receiptKey} added to pending map for ${phone}`);
      }

      logMessage({
        phone, employeeId: employee.id, messageType: "image",
        ocrConfidence: extracted.confidence, processingMs: Date.now() - startTime,
      }).catch((err) => console.error("Log write failed silently:", err));
    }
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

async function handleDocumentMessage(
  message: Record<string, unknown>,
  phone: string,
  employee: EmployeeInfo
) {
  const startTime = Date.now();
  const messageId = message.id as string | undefined;
  const doc = message.document as { id: string; mime_type?: string; filename?: string } | undefined;
  if (!doc?.id) {
    console.error(`[WhatsApp] Document message from ${phone} missing document.id`);
    return;
  }

  const mimeType = doc.mime_type ?? "";
  if (!mimeType.includes("pdf")) {
    await sendTextMessage(phone, "I can only process PDF documents. Please send a PDF file or take a photo instead.");
    return;
  }

  console.log(`[WhatsApp] PDF received from ${phone} (${doc.filename ?? "unknown"}) — processing with Gemini`);

  try {
    // Step 1: Download PDF
    const pdfBuffer = await downloadWhatsAppMedia(doc.id);
    console.log(`[WhatsApp] PDF downloaded: ${pdfBuffer.length} bytes`);

    // Step 2: Get firm categories
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

    // Step 3: Send PDF directly to Gemini — classify + extract in one call
    const { documentType, raw } = await extractInvoiceFromPDF(pdfBuffer, categoryNames);
    console.log(`[WhatsApp] PDF classified as: ${documentType}`);

    if (documentType === "invoice") {
      const extracted = parseGeminiInvoiceOutput(raw);
      console.log(`[WhatsApp] Invoice extracted: ${JSON.stringify(extracted)}`);

      if (extracted.confidence === "HIGH" || extracted.confidence === "MEDIUM") {
        if (messageId) await sendReaction(phone, messageId, "\ud83d\udc4d");

        const filename = `INV_${employee.name}_${extracted.issueDate}_${extracted.vendor}.pdf`.replace(/\s+/g, "_");
        const { fileId, thumbnailUrl } = await uploadToDrive(pdfBuffer, filename);

        await saveInvoice({
          employeeId: employee.id,
          firmId: employee.firmId,
          vendor: extracted.vendor,
          invoiceNumber: extracted.invoiceNumber,
          issueDate: extracted.issueDate,
          dueDate: extracted.dueDate,
          paymentTerms: extracted.paymentTerms,
          subtotal: extracted.subtotal,
          taxAmount: extracted.taxAmount,
          totalAmount: extracted.totalAmount,
          category: extracted.category,
          confidence: extracted.confidence,
          driveFileId: fileId,
          thumbnailUrl,
        });
        console.log(`[WhatsApp] Invoice saved for ${phone}`);

        await sendInvoiceConfirmationMessage(phone, {
          vendor: extracted.vendor,
          totalAmount: extracted.totalAmount,
          issueDate: extracted.issueDate,
          dueDate: extracted.dueDate,
          invoiceNumber: extracted.invoiceNumber,
          category: extracted.category,
        });
      } else {
        const receiptKey = generateReceiptKey();
        const bodyText = [
          "Please check this invoice:",
          "",
          `Vendor: ${extracted.vendor || "(unknown)"}`,
          `Amount: RM${extracted.totalAmount.toFixed(2)}`,
          `Issue Date: ${extracted.issueDate || "(unknown)"}`,
          `Due Date: ${extracted.dueDate || "-"}`,
          `Invoice No: ${extracted.invoiceNumber || "-"}`,
          `Category: ${extracted.category || "(unknown)"}`,
          "",
          "Is this correct?",
        ].join("\n");

        await sendInteractiveButtons(phone, bodyText, [
          { id: `confirm_yes:${receiptKey}`, title: "Yes" },
          { id: `confirm_no:${receiptKey}`, title: "No" },
        ]);

        await addPendingReceipt(phone, receiptKey, {
          type: "invoice",
          vendor: extracted.vendor,
          invoiceNumber: extracted.invoiceNumber,
          issueDate: extracted.issueDate,
          dueDate: extracted.dueDate,
          paymentTerms: extracted.paymentTerms,
          subtotal: extracted.subtotal,
          taxAmount: extracted.taxAmount,
          totalAmount: extracted.totalAmount,
          category: extracted.category,
          confidence: extracted.confidence,
          imageBuffer: pdfBuffer.toString("base64"),
          employeeId: employee.id,
          firmId: employee.firmId,
          employeeName: employee.name,
        });
        console.log(`[WhatsApp] LOW confidence invoice ${receiptKey} added to pending map`);
      }

      logMessage({
        phone, employeeId: employee.id, messageType: "document",
        ocrConfidence: extracted.confidence, processingMs: Date.now() - startTime,
      }).catch((err) => console.error("Log write failed silently:", err));

    } else {
      // PDF classified as receipt
      const extracted = parseGeminiOutput(raw);
      console.log(`[WhatsApp] Receipt extracted from PDF: ${JSON.stringify(extracted)}`);

      if (extracted.confidence === "HIGH" || extracted.confidence === "MEDIUM") {
        if (messageId) await sendReaction(phone, messageId, "\ud83d\udc4d");

        const filename = `${employee.name}_${extracted.date}_${extracted.merchant}.pdf`.replace(/\s+/g, "_");
        const { fileId, thumbnailUrl } = await uploadToDrive(pdfBuffer, filename);

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
        console.log(`[WhatsApp] Claim saved from PDF for ${phone}`);

        await sendConfirmationMessage(phone, {
          merchant: extracted.merchant,
          amount: extracted.amount,
          date: extracted.date,
          receiptNumber: extracted.receiptNumber,
          category: extracted.category,
        });
      } else {
        const receiptKey = generateReceiptKey();
        const bodyText = [
          "Please check these details:",
          "",
          `Merchant: ${extracted.merchant || "(unknown)"}`,
          `Amount: RM${extracted.amount.toFixed(2)}`,
          `Date: ${extracted.date || "(unknown)"}`,
          `Receipt No: ${extracted.receiptNumber || "-"}`,
          `Category: ${extracted.category || "(unknown)"}`,
          "",
          "Is this correct?",
        ].join("\n");

        await sendInteractiveButtons(phone, bodyText, [
          { id: `confirm_yes:${receiptKey}`, title: "Yes" },
          { id: `confirm_no:${receiptKey}`, title: "No" },
        ]);

        await addPendingReceipt(phone, receiptKey, {
          type: "receipt",
          merchant: extracted.merchant,
          amount: extracted.amount,
          date: extracted.date,
          receiptNumber: extracted.receiptNumber,
          category: extracted.category,
          confidence: extracted.confidence,
          imageBuffer: pdfBuffer.toString("base64"),
          employeeId: employee.id,
          firmId: employee.firmId,
          employeeName: employee.name,
        });
        console.log(`[WhatsApp] LOW confidence receipt (PDF) ${receiptKey} added to pending map`);
      }

      logMessage({
        phone, employeeId: employee.id, messageType: "document",
        ocrConfidence: extracted.confidence, processingMs: Date.now() - startTime,
      }).catch((err) => console.error("Log write failed silently:", err));
    }
  } catch (err) {
    console.error(`[WhatsApp] Document processing error for ${phone}:`, err);
    sendTelegramAlert({
      error: err instanceof Error ? err : String(err),
      context: { location: "handleDocumentMessage", phone, messageType: "document" },
    });
    await sendTextMessage(phone, "Sorry, there was an error processing your document. Please try again.");
  }
}

async function handleInteractiveMessage(
  message: Record<string, unknown>,
  phone: string,
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

  if (buttonId.startsWith("confirm_yes:")) {
    const receiptKey = buttonId.split(":")[1];
    const session = await getSession(phone);
    if (!session || !session.pending_receipt) {
      await sendTextMessage(phone, "No pending receipt found. Please send a new receipt photo.");
      return;
    }

    const receiptMap = session.pending_receipt as Record<string, Record<string, unknown>>;
    const pending = receiptMap[receiptKey];
    if (!pending) {
      await sendTextMessage(phone, "This receipt has already been processed.");
      return;
    }

    try {
      const imageBuffer = Buffer.from(pending.imageBuffer as string, "base64");

      if (pending.type === "invoice") {
        // Invoice confirmation
        const filename = `INV_${pending.employeeName}_${pending.issueDate}_${pending.vendor}.jpg`.replace(/\s+/g, "_");
        const { fileId, thumbnailUrl } = await uploadToDrive(imageBuffer, filename);
        console.log(`[WhatsApp] Uploaded invoice to Drive: ${fileId}`);

        await saveInvoice({
          employeeId: pending.employeeId as string,
          firmId: pending.firmId as string,
          vendor: pending.vendor as string,
          invoiceNumber: pending.invoiceNumber as string,
          issueDate: pending.issueDate as string,
          dueDate: pending.dueDate as string,
          paymentTerms: pending.paymentTerms as string,
          subtotal: pending.subtotal as number,
          taxAmount: pending.taxAmount as number,
          totalAmount: pending.totalAmount as number,
          category: pending.category as string,
          confidence: pending.confidence as "HIGH" | "MEDIUM" | "LOW",
          driveFileId: fileId,
          thumbnailUrl,
        });
        console.log(`[WhatsApp] Invoice saved for ${phone} (key ${receiptKey})`);

        await removePendingReceipt(phone, receiptKey);

        await sendInvoiceConfirmationMessage(phone, {
          vendor: pending.vendor as string,
          totalAmount: pending.totalAmount as number,
          issueDate: pending.issueDate as string,
          dueDate: pending.dueDate as string,
          invoiceNumber: pending.invoiceNumber as string,
          category: pending.category as string,
        });
      } else {
        // Receipt/Claim → Claim table
        const filename = `${pending.employeeName}_${pending.date}_${pending.merchant}.jpg`.replace(/\s+/g, "_");
        const { fileId, thumbnailUrl } = await uploadToDrive(imageBuffer, filename);
        console.log(`[WhatsApp] Uploaded to Drive: ${fileId}`);

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
        console.log(`[WhatsApp] Claim saved for ${phone} (receipt ${receiptKey})`);

        await removePendingReceipt(phone, receiptKey);

        await sendConfirmationMessage(phone, {
          merchant: pending.merchant as string,
          amount: pending.amount as number,
          date: pending.date as string,
          receiptNumber: pending.receiptNumber as string,
          category: pending.category as string,
        });
      }

      // Fire-and-forget log
      logMessage({
        phone,
        employeeId: pending.employeeId as string,
        messageType: "interactive",
        ocrConfidence: pending.confidence as string,
      }).catch((err) => console.error("Log write failed silently:", err));
    } catch (err) {
      console.error(`[WhatsApp] confirm_yes error for ${phone} (receipt ${receiptKey}):`, err);
      sendTelegramAlert({
        error: err instanceof Error ? err : String(err),
        context: { location: `handleInteractiveMessage/confirm_yes:${receiptKey}`, phone, messageType: "interactive" },
      });
      await sendTextMessage(phone, "Sorry, there was an error saving your receipt. Please try again.");
    }
  } else if (buttonId.startsWith("confirm_no:")) {
    const receiptKey = buttonId.split(":")[1];
    const session = await getSession(phone);
    if (!session) {
      await sendTextMessage(phone, "No pending receipt found. Please send a new receipt photo.");
      return;
    }

    const receiptMap = session.pending_receipt as Record<string, Record<string, unknown>>;
    if (!receiptMap[receiptKey]) {
      await sendTextMessage(phone, "This receipt has already been processed.");
      return;
    }

    // Track which receipt is being corrected
    await updateSession(session.id, { step: `AWAITING_CORRECTION:${receiptKey}` });

    await sendTextMessage(
      phone,
      "What needs to be corrected? Type the correction and I'll update it."
    );
    console.log(`[WhatsApp] Receipt ${receiptKey} set to AWAITING_CORRECTION for ${phone}`);
  } else if (buttonId === "menu_submit") {
    await sendTextMessage(phone, "Sure! Just snap a photo of your receipt and send it here. I'll take care of the rest.");
  } else if (buttonId === "menu_status") {
    const statusMsg = await getClaimsForPhone(phone, "pending");
    await sendTextMessage(phone, statusMsg);
  } else if (buttonId === "menu_summary") {
    const summaryMsg = await getClaimsForPhone(phone, "all");
    await sendTextMessage(phone, summaryMsg);
  } else if (buttonId === "menu_help") {
    await sendTextMessage(phone, "Here's what I can do for you:\n\n1. Process receipts - just send me a photo\n2. Check your claim status - type \"status\"\n3. View your spending summary - type \"summary\"\n\nYou can also type \"menu\" anytime to see your options.");
  }
}

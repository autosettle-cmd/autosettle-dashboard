import { GoogleAuth } from "google-auth-library";
import { readFileSync } from "fs";
import { sendTextMessage, sendInteractiveMenu, sendConfirmationMessage } from "@/lib/whatsapp/send";
import { saveClaim, getClaimsForPhone } from "@/lib/whatsapp/claims";
import { startMileageFlow } from "@/lib/whatsapp/mileage";
import { deleteSession, updateSession, removePendingReceipt } from "@/lib/whatsapp/session";
import { uploadToDrive } from "@/lib/whatsapp/drive";
import type { EmployeeInfo } from "@/lib/whatsapp/employees";
import { sendTelegramAlert } from "@/lib/whatsapp/errorNotify";
import { brand } from "@/config/branding";
type SessionData = Awaited<ReturnType<typeof import("@/lib/whatsapp/session").getSession>>;

let authClient: GoogleAuth | null = null;

function getAuthClient(): GoogleAuth {
  if (!authClient) {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath) {
      const credentials = JSON.parse(readFileSync(keyPath, "utf-8"));
      authClient = new GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
    } else {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
      authClient = new GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
    }
  }
  return authClient;
}

const LISA_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "send_message",
        description: "Send a text message to the user via WhatsApp",
        parameters: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING", description: "The message text to send" },
          },
          required: ["text"],
        },
      },
      {
        name: "send_interactive_menu",
        description: "Send the main interactive menu to the user",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "get_status",
        description: "Get the user's claim status. Sends the result directly to WhatsApp.",
        parameters: {
          type: "OBJECT",
          properties: {
            filter: {
              type: "STRING",
              enum: ["pending", "approved", "rejected", "all"],
              description: "Which claims to show",
            },
          },
          required: ["filter"],
        },
      },
      {
        name: "save_claim",
        description: "Save a claim with corrected fields from the pending session data. Only use when session is in AWAITING_CORRECTION state. You MUST include the receipt_key from the session step.",
        parameters: {
          type: "OBJECT",
          properties: {
            receipt_key: { type: "STRING", description: "The receipt key being corrected (from the AWAITING_CORRECTION:key step)" },
            date: { type: "STRING", description: "Corrected date in YYYY-MM-DD format, or original if not corrected" },
            merchant: { type: "STRING", description: "Corrected merchant name, or original if not corrected" },
            amount: { type: "NUMBER", description: "Corrected amount, or original if not corrected" },
            receiptNumber: { type: "STRING", description: "Corrected receipt number, or original if not corrected" },
            category: { type: "STRING", description: "Corrected category, or original if not corrected" },
          },
          required: ["receipt_key", "date", "merchant", "amount", "receiptNumber", "category"],
        },
      },
      {
        name: "start_mileage_claim",
        description: "Start a mileage claim collection flow. Use when employee wants to log a trip/mileage/perjalanan. Only when session is IDLE (no pending receipts).",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "delete_session",
        description: "Delete the current session after saving the claim",
        parameters: {
          type: "OBJECT",
          properties: {
            session_id: { type: "STRING", description: "The session ID to delete" },
          },
          required: ["session_id"],
        },
      },
    ],
  },
];

function buildSystemPrompt(
  phone: string,
  employee: EmployeeInfo,
  session: SessionData | null,
  messageText: string
): string {
  return `You are ${brand.ai.name}, the ${brand.name} AI assistant. You help Malaysian SME employees with their expense claims via WhatsApp.

Client context:
- Name: ${employee.name}
- Phone: ${phone}
- Firm: ${employee.firmName}

Current session:
- State: ${session?.state || "IDLE"}
- Step: ${session?.step || ""}
- Session ID: ${session?.id || ""}
- Pending Receipts (map keyed by receipt_key): ${JSON.stringify(session?.pending_receipt || {})}
${session?.step?.startsWith("AWAITING_CORRECTION:") ? `- Correcting receipt key: ${session.step.split(":")[1]}` : ""}

Current message: ${messageText}

Strict rules:
1. ALWAYS call at least one tool — NEVER reply with text only
2. NEVER make up or modify receipt data — only use Pending Receipt data
3. Match client language (English or Bahasa Malaysia)
4. Be brief, friendly, clear
5. NEVER call create_session — only the OCR pipeline creates sessions
6. If Session ID is empty, do not call delete_session

Status query routing:
- pending / status / apa status → call get_status with filter=pending
- rejected / not approved / ditolak → call get_status with filter=rejected
- approved / diluluskan → call get_status with filter=approved
- summary / this month / ringkasan / how much → call get_status with filter=all

IDLE state (no session):
- Client wants mileage claim (mileage, log trip, tuntut mileage, perjalanan, jarak) → call start_mileage_claim
- Client explicitly wants to submit receipt (claim, submit, hantar resit, nak claim, receipt) → send_message: send a photo of your receipt
- Everything else including greetings → call send_interactive_menu

COLLECTING (no AWAITING_CORRECTION step):
- Client sends text → send_message: Please use the Yes or No buttons above

COLLECTING + AWAITING_CORRECTION:<receipt_key>:
- The step field contains AWAITING_CORRECTION:<receipt_key> — extract the receipt_key
- Look up that receipt_key in the Pending Receipts map to get the original data
- Client types correction → parse it, apply to that receipt's data
- call save_claim with receipt_key and corrected values merged with that receipt's data
- Do NOT call delete_session — the system handles cleanup automatically
- call send_message with brief confirmation like "Updated and saved!"`;
}

export async function handleLisa(
  phone: string,
  employee: EmployeeInfo,
  session: SessionData | null,
  messageText: string
): Promise<void> {
  const projectId = process.env.VERTEX_PROJECT_ID!;
  const location = process.env.VERTEX_LOCATION || "asia-southeast1";
  const model = process.env.VERTEX_MODEL || "gemini-1.5-flash";

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const auth = getAuthClient();
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const systemPrompt = buildSystemPrompt(phone, employee, session, messageText);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.token}`,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: messageText }],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      tools: LISA_TOOLS,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Lisa] Gemini API error: ${res.status} — ${errText}`);
    sendTelegramAlert({
      error: `Gemini API ${res.status}: ${errText.slice(0, 300)}`,
      context: { location: "handleLisa", phone, messageType: "text", messageText: messageText },
    });
    await sendInteractiveMenu(phone, employee.name);
    return;
  }

  const json = await res.json();
  const candidate = json.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  // Execute all function calls returned by Gemini
  let hasToolCall = false;
  for (const part of parts) {
    if (part.functionCall) {
      hasToolCall = true;
      await executeToolCall(part.functionCall, phone, employee, session);
    }
  }

  // Fallback: if Gemini returned text-only (broke rule 1), send it as a message
  if (!hasToolCall) {
    const textPart = parts.find((p: Record<string, unknown>) => p.text);
    if (textPart?.text) {
      await sendTextMessage(phone, textPart.text as string);
    } else {
      await sendInteractiveMenu(phone, employee.name);
    }
  }
}

async function executeToolCall(
  functionCall: { name: string; args: Record<string, unknown> },
  phone: string,
  employee: EmployeeInfo,
  session: SessionData | null
): Promise<void> {
  const { name, args } = functionCall;
  console.log(`[Lisa] Tool call: ${name}(${JSON.stringify(args)})`);

  switch (name) {
    case "send_message": {
      await sendTextMessage(phone, args.text as string);
      break;
    }

    case "send_interactive_menu": {
      await sendInteractiveMenu(phone, employee.name);
      break;
    }

    case "get_status": {
      const filter = args.filter as "pending" | "approved" | "rejected" | "all";
      const statusMsg = await getClaimsForPhone(phone, filter);
      await sendTextMessage(phone, statusMsg);
      break;
    }

    case "save_claim": {
      if (!session?.pending_receipt) {
        await sendTextMessage(phone, "No pending receipt to save. Please send a new receipt photo.");
        return;
      }
      const receiptKey = args.receipt_key as string;
      const receiptMap = session.pending_receipt as Record<string, Record<string, unknown>>;
      const pending = receiptKey ? receiptMap[receiptKey] : null;

      if (!pending) {
        await sendTextMessage(phone, "Could not find that pending receipt. Please send a new receipt photo.");
        return;
      }

      // Upload image to Drive from stored base64
      const imageBuffer = Buffer.from(pending.imageBuffer as string, "base64");
      const merchant = (args.merchant as string) || (pending.merchant as string);
      const date = (args.date as string) || (pending.date as string);
      const filename = `${pending.employeeName}_${date}_${merchant}.jpg`.replace(/\s+/g, "_");
      const { fileId, thumbnailUrl } = await uploadToDrive(imageBuffer, filename);

      await saveClaim({
        employeeId: pending.employeeId as string,
        firmId: pending.firmId as string,
        claimDate: date,
        merchant,
        amount: (args.amount as number) ?? (pending.amount as number),
        receiptNumber: (args.receiptNumber as string) ?? (pending.receiptNumber as string),
        category: (args.category as string) || (pending.category as string),
        confidence: pending.confidence as "HIGH" | "MEDIUM" | "LOW",
        driveFileId: fileId,
        thumbnailUrl,
      });

      // Remove this receipt from pending map (auto-deletes session if last one)
      await removePendingReceipt(phone, receiptKey);

      await sendConfirmationMessage(phone, {
        merchant,
        amount: (args.amount as number) ?? (pending.amount as number),
        date,
        receiptNumber: (args.receiptNumber as string) ?? (pending.receiptNumber as string),
        category: (args.category as string) || (pending.category as string),
      });
      break;
    }

    case "start_mileage_claim": {
      await startMileageFlow(phone, employee);
      break;
    }

    case "delete_session": {
      const sessionId = args.session_id as string;
      if (sessionId) {
        await deleteSession(sessionId);
        console.log(`[Lisa] Session ${sessionId} deleted`);
      }
      break;
    }

    case "update_session": {
      const sessionId = args.session_id as string;
      if (sessionId) {
        const updates: Record<string, unknown> = {};
        if (args.step) updates.step = args.step;
        await updateSession(sessionId, updates as { step?: string });
      }
      break;
    }

    default:
      console.warn(`[Lisa] Unknown tool: ${name}`);
  }
}

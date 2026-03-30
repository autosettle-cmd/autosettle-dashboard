# Autosettle — WhatsApp Backend Migration Spec

## Overview

The entire WhatsApp + OCR pipeline previously ran in n8n. We are replacing it with native Node.js code inside the Next.js app under /app/api/whatsapp/. The behavior must exactly match the working n8n workflow.

All data is written to Postgres via Prisma. No Softr API calls.

---

## Folder Structure

```
/app/api/whatsapp/
  webhook/route.ts        -- Main POST endpoint. Meta sends all WhatsApp events here.
  verify/route.ts         -- GET endpoint. Meta webhook verification (one-time setup).

/lib/whatsapp/
  send.ts                 -- All WhatsApp Cloud API send functions
  ocr.ts                  -- Google Cloud Vision OCR
  gemini.ts               -- Gemini extraction + categorisation
  session.ts              -- Session CRUD (Postgres)
  claims.ts               -- Claims CRUD (Postgres)
  employees.ts            -- Employee lookup by phone (Postgres)
  parser.ts               -- Parse and validate Gemini output
  drive.ts                -- Google Drive upload + thumbnail URL
  errorNotify.ts          -- Telegram error alert (replaces n8n Error Workflow)
```

---

## Webhook Entry Point — /app/api/whatsapp/webhook/route.ts

### GET (verification)

Meta calls GET on first setup to verify the webhook.

```
Query params: hub.mode, hub.verify_token, hub.challenge
If hub.mode === 'subscribe' AND hub.verify_token === process.env.WHATSAPP_VERIFY_TOKEN
  → return hub.challenge as plain text with status 200
Else → return 403
```

### POST (incoming messages)

All WhatsApp events come in here. Must return 200 immediately — Meta retries if you take too long.

Flow:

```
1. Return 200 immediately (process async or keep fast)
2. Extract entry from body: body.entry[0].changes[0].value
3. Drop if no messages array (delivery receipts, read receipts, status updates)
   → Check: if (!value.messages || value.messages.length === 0) return 200
4. Extract message = value.messages[0]
5. Extract phone = message.from (E.164 format, e.g. 60123456789)
6. Look up employee by phone in Postgres employees table
7. If not found → send unregistered message → return
8. If found → proceed to message router
```

---

## Message Router

After employee is found, route based on message.type:

```
switch (message.type)
  case 'image'   → OCR Pipeline
  case 'interactive' → Button Handler
  case 'text'    → Lisa Agent (free text)
  default        → ignore (do nothing)
```

Note: document type (PDF) should also route to OCR Pipeline — Phase 2.

---

## Employee Lookup

Function: lookupEmployeeByPhone(phone: string)

```
Query: SELECT e.*, f.name as firm_name, f.id as firm_id
       FROM employees e
       JOIN firms f ON e.firm_id = f.id
       WHERE e.phone = phone AND e.status = 'active'
Returns: employee object or null
```

If null → send this exact message:

"Hi there! It looks like your number isn't registered with any of our services yet. To get started, please reach out to us at: [jeffrylau@auto-settle.com](mailto:jeffrylau@auto-settle.com) or +6012-345-8661"

---

## Session Management

Sessions table in Postgres tracks the state of a low-confidence receipt correction flow.

Schema (already in Prisma):

```
id           UUID primary key
phone        String
state        String   -- IDLE | COLLECTING
step         String   -- AWAITING_CONFIRMATION | AWAITING_CORRECTION
pendingData  Json     -- extracted receipt fields being confirmed/corrected
createdAt    DateTime
updatedAt    DateTime
```

Functions in /lib/whatsapp/session.ts:

```
getSession(phone)          -- get active session for phone, returns null if none
createSession(phone, data) -- create new session with state=COLLECTING, step=AWAITING_CONFIRMATION
updateSession(id, updates) -- update state, step, or pendingData
deleteSession(id)          -- delete session after claim is saved
```

Rule: Only ONE session per phone at a time. Before creating, check if one already exists.

---

## OCR Pipeline

Triggered when message.type === 'image'.

### Step 1 — Get session state

```
session = await getSession(phone)
```

### Step 2 — Admin vs Employee routing

Check if [employee.is](http://employee.is)_admin === true:

- Admin path: process image but save with different flag (save_as_admin = true)
- Employee path: normal flow

Both paths run the same OCR + Gemini extraction.

### Step 3 — Download image

```
imageId = message.image.id
Fetch: GET https://graph.facebook.com/v22.0/{imageId}
  Header: Authorization: Bearer {WHATSAPP_TOKEN}
Returns: { url: 'https://lookaside.fbsbx.com/...' }

Fetch image binary from that URL:
  Header: Authorization: Bearer {WHATSAPP_TOKEN}
Returns: image buffer
```

### Step 4 — Fetch categories from Postgres

```
firmCategories = await getActiveCategories(employee.firm_id)
-- Returns: array of category names for the employee's firm
-- Used to inject into the Gemini prompt so it picks the right category
```

### Step 5 — Google Cloud Vision OCR

```
Convert image buffer to base64
POST https://vision.googleapis.com/v1/images:annotate
Auth: Bearer {GOOGLE_ACCESS_TOKEN} (from service account)
Body:
{
  requests: [{
    image: { content: base64Image },
    features: [{ type: 'TEXT_DETECTION' }]
  }]
}
Extract: response.responses[0].fullTextAnnotation.text
```

### Step 6 — Normalise OCR text

Clean up the raw OCR text before sending to Gemini:

```
- Remove excessive whitespace and blank lines
- Trim to max 3000 characters (Gemini prompt limit consideration)
- Keep all numbers, dates, merchant names intact
```

### Step 7 — Gemini Extraction

Send normalised OCR text to Gemini (Vertex AI) with this prompt structure:

System prompt:

```
You are an expert receipt parser for Malaysian SME expense claims.
Extract the following fields from the receipt OCR text.
Return ONLY valid JSON, no explanation, no markdown.

Fields to extract:
- date: receipt date in YYYY-MM-DD format
- merchant: creditor/supplier name
- amount: total amount as a number (RM, no currency symbol)
- receiptNumber: invoice or receipt number (empty string if not found)
- category: pick the BEST match from this list only: [list of firm categories]
- confidence: HIGH, MEDIUM, or LOW

Confidence rules:
- HIGH: date, merchant, amount all clearly extracted
- MEDIUM: all fields found but some ambiguity
- LOW: one or more key fields missing or unclear

Return format:
{"date": "", "merchant": "", "amount": 0, "receiptNumber": "", "category": "", "confidence": "HIGH"}
```

User message: normalised OCR text

Model: gemini-1.5-flash (or as configured in VERTEX_MODEL env var)

### Step 8 — Parse Gemini output

In /lib/whatsapp/parser.ts:

```
- Strip any markdown fences (```json) if present
- JSON.parse the response
- Validate all required fields exist
- If parse fails or validation fails → treat as LOW confidence
```

### Step 9 — Confidence routing

#### HIGH or MEDIUM confidence

```
1. React to message with emoji 👍 (WhatsApp reaction)
2. Upload image to Google Drive (folder: DRIVE_FOLDER_ID env var)
3. Get thumbnail URL from Drive response
4. Save to claims table in Postgres
5. Send confirmation message (see Confirmation Message Format below)
```

#### LOW confidence

```
1. If session already exists for this phone → skip create, use existing
2. Create session with pendingData = extracted fields
3. Send confirmation buttons (Yes / No) with extracted data shown
   (see Low Confidence Button Message Format below)
4. Update session step = AWAITING_CONFIRMATION
```

---

## Button Handler

Triggered when message.type === 'interactive'.

Extract button ID:

```
buttonId = message.interactive.button_reply?.id
         || message.interactive.list_reply?.id
```

### Button routing

```
if buttonId === 'confirm_yes'
  → get session → save claim → delete session → send saved confirmation

if buttonId === 'confirm_no'
  → update session step = AWAITING_CORRECTION
  → send message: "What needs to be corrected? Type the correction and I'll update it."

if buttonId starts with 'menu_'
  → send_interactive_menu (show main menu again) or handle specific menu actions
```

---

## Lisa Agent (Free Text)

Triggered when message.type === 'text' AND no image.

Lisa is the AI assistant for free-text queries. Implemented as a call to Gemini/Claude with tools.

### Get session first

```
session = await getSession(phone)
```

### Lisa system prompt

```
You are Lisa, the Autosettle AI assistant. You help Malaysian SME employees with their expense claims via WhatsApp.

Client context:
- Name: {employee.name}
- Phone: {phone}
- Firm: {employee.firm_name}

Current session:
- State: {session?.state || 'IDLE'}
- Step: {session?.step || ''}
- Session ID: {session?.id || ''}
- Pending Receipt: {JSON.stringify(session?.pendingData || {})}

Current message: {message.text.body}

Strict rules:
1. ALWAYS call at least one tool — NEVER reply with text only
2. NEVER make up or modify receipt data — only use Pending Receipt data
3. Match client language (English or Bahasa Malaysia)
4. Be brief, friendly, clear
5. NEVER call create_session — only the OCR pipeline creates sessions
6. If Session ID is empty, do not call delete_session or update_session

Status query routing:
- pending / status / apa status → call get_status with filter=pending
- rejected / not approved / ditolak → call get_status with filter=rejected  
- approved / diluluskan → call get_status with filter=approved
- summary / this month / ringkasan / how much → call get_status with filter=all

IDLE state (no session):
- Client explicitly wants to submit (claim, submit, hantar resit, nak claim) → send_message: send a photo of your receipt
- Everything else including greetings → call send_interactive_menu

COLLECTING + AWAITING_CONFIRMATION:
- Client sends text → send_message: Please use the Yes or No buttons above

COLLECTING + AWAITING_CORRECTION:
- Client types correction → parse it, apply to Pending Receipt data
- call save_claim (with corrected values)
- call delete_session
- call send_message with saved confirmation format
```

### Lisa tools (implement as functions, pass to Gemini as tools)

```
send_message(text: string)
  → calls sendTextMessage(phone, text)

send_interactive_menu()
  → calls sendInteractiveMenu(phone, employeeName)

get_status(filter: 'pending' | 'approved' | 'rejected' | 'all')
  → queries claims from Postgres filtered by phone + approval status
  → formats and sends WhatsApp message with results
  → does NOT return to Lisa — sends directly

save_claim(fields: ClaimFields)
  → saves to claims table
  → sends confirmation message

delete_session(session_id: string)
  → calls deleteSession(session_id)

update_session(session_id: string, updates: object)
  → calls updateSession(session_id, updates)
```

---

## WhatsApp Send Functions — /lib/whatsapp/send.ts

Base URL: https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_NUMBER_ID}/messages

Auth header: Authorization: Bearer {WHATSAPP_TOKEN}

```tsx
sendTextMessage(to: string, body: string)
  -- Sends plain text. Never use ** or * in body.

sendReaction(to: string, messageId: string, emoji: string)
  -- Reacts to a specific message. Used for receipt acknowledgement.

sendInteractiveButtons(to: string, bodyText: string, buttons: Array<{id: string, title: string}>)
  -- Max 3 buttons. Used for Yes/No confirmation on low confidence.

sendInteractiveMenu(to: string, name: string)
  -- Sends the main interactive menu with list options.
  -- Menu options: Submit Receipt, Check Status, My Summary, Help

sendConfirmationMessage(to: string, fields: ClaimFields)
  -- Sends the saved receipt confirmation in exact format:
  -- checck format below
```

### Confirmation Message Format (HIGH/MEDIUM/save after correction)

```
Saved!

[Merchant Name]
RM[Amount]
[Date]
[Invoice/Receipt Number]
[Category]

Send your next receipt
```

Note: No bold, no italic. Plain text only.

### Low Confidence Button Message Format

```
Please check these details:

[Merchant Name]
RM[Amount]
[Date]
[Invoice/Receipt Number]
[Category]

Is this correct?
```

With two buttons: id=confirm_yes title=Yes | id=confirm_no title=No

---

## Google Drive Upload — /lib/whatsapp/drive.ts

```
uploadToDrive(imageBuffer: Buffer, filename: string, folderId: string)
  → Upload to Google Drive using service account
  → Set parent = DRIVE_FOLDER_ID
  → Returns: { fileId, thumbnailUrl }

getThumbnailUrl(fileId: string)
  → Returns: https://drive.google.com/thumbnail?id={fileId}&sz=w800
```

Service account: use GOOGLE_SERVICE_ACCOUNT_JSON env var (full JSON string)

---

## Save Claim — /lib/whatsapp/claims.ts

```tsx
saveClaim({
  employeeId: string,
  firmId: string,
  claimDate: string,        // YYYY-MM-DD
  merchant: string,
  amount: number,
  receiptNumber: string,
  category: string,
  confidence: string,
  driveFileId: string,
  thumbnailUrl: string,
  source: 'whatsapp'
})
```

Sets on create:

- status = 'pending_review'
- approval = 'pending_approval'
- paymentStatus = 'unpaid'

---

## Get Status — /lib/whatsapp/claims.ts

```tsx
getClaimsForPhone(phone: string, filter: 'pending' | 'approved' | 'rejected' | 'all')
```

Filter mapping:

- pending → WHERE approval = 'pending_approval'
- approved → WHERE approval = 'approved'
- rejected → WHERE approval = 'not_approved'
- all → all claims for this employee (current month + year-to-date summary)

Output: formatted string message matching the existing n8n logic:

- pending/approved/rejected: show by category grouping with totals
- rejected: show individual lines (last 30 days only, max 10)
- all: monthly summary + year-to-date breakdown by category

---

## Error Notifications — /lib/whatsapp/errorNotify.ts

Replace the n8n Error Workflow with a try/catch wrapper.

```tsx
sendTelegramAlert({
  error: Error,
  context: {
    phone?: string,
    messageType?: string,
    messageText?: string,
    step?: string
  }
})
```

Telegram bot: use TELEGRAM_BOT_TOKEN env var

Telegram chat ID: 811760571 (Jeff's personal chat)

Message format (plain text, no markdown):

```
-- AUTOSETTLE ERROR ALERT --

Location: [function/file name]
Error: [error.message]

-- User Context --
Phone: [phone]
Message Type: [type]
Message: [text truncated to 200 chars]
Step: [session step if known]

Time: [ISO timestamp]
```

Wrap every major async operation in try/catch → call sendTelegramAlert on error, then continue or return gracefully.

---

## Environment Variables Needed

```
WHATSAPP_TOKEN=                    -- WhatsApp Cloud API bearer token
WHATSAPP_PHONE_NUMBER_ID=          -- 1017147768151711
WHATSAPP_VERIFY_TOKEN=             -- any secret string for webhook verification
GOOGLE_SERVICE_ACCOUNT_JSON=       -- full service account JSON as string
VERTEX_PROJECT_ID=                 -- Google Cloud project ID
VERTEX_LOCATION=                   -- e.g. asia-southeast1
VERTEX_MODEL=                      -- e.g. gemini-1.5-flash
GOOGLE_VISION_API_KEY=             -- or use service account (preferred)
DRIVE_FOLDER_ID=                   -- 1ZdbOHk6_gyPx-08NlNLpFAMeF1AQlpRb
TELEGRAM_BOT_TOKEN=                -- for error alerts
TELEGRAM_CHAT_ID=811760571         -- Jeff's chat
```

---

## Build Order for Claude Code

1. webhook/route.ts — entry point, message drop filter, employee lookup
2. /lib/whatsapp/send.ts — all WhatsApp send functions
3. /lib/whatsapp/session.ts — session CRUD
4. /lib/whatsapp/ocr.ts — Cloud Vision integration
5. /lib/whatsapp/gemini.ts — Gemini extraction
6. /lib/whatsapp/parser.ts — output parser + validator
7. /lib/whatsapp/drive.ts — Drive upload
8. /lib/whatsapp/claims.ts — save + query claims
9. Button handler logic (in webhook route)
10. Lisa agent + tools
11. /lib/whatsapp/errorNotify.ts — Telegram alerts
12. verify/route.ts — webhook verification GET endpoint

---

## Milestone Testing Plan

Build and test in milestones. After each milestone, pause and tell Jeff what to test. Do NOT proceed to the next milestone until Jeff confirms the tests passed.

After completing each milestone, generate or update /tests/whatsapp.http with REST Client test requests covering that milestone. Jeff uses the REST Client VS Code extension to run these.

### Milestone 1 — Webhook is alive

Build: webhook/route.ts + verify/route.ts + employee lookup

Test file: /tests/whatsapp.http

Tests to include:

```
### Test GET verification
GET http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token={{WHATSAPP_VERIFY_TOKEN}}&hub.challenge=test123
# Expected: returns test123 with status 200

### Test POST — unknown phone (unregistered)
POST http://localhost:3000/api/whatsapp/webhook
Content-Type: application/json
{ "entry": [{ "changes": [{ "value": { "messages": [{ "from": "60999999999", "type": "text", "text": { "body": "hello" } }] } }] }] }
# Expected: 200, logs unregistered flow

### Test POST — delivery receipt (no messages, should drop silently)
POST http://localhost:3000/api/whatsapp/webhook
Content-Type: application/json
{ "entry": [{ "changes": [{ "value": {} }] }] }
# Expected: 200, silent drop, no processing
```

Pass condition: All 3 return 200. Logs show correct routing. No crashes.

---

### Milestone 2 — Send messages back

Build: /lib/whatsapp/send.ts

Update: /tests/whatsapp.http

Tests to include:

```
### Test POST — registered phone sends text (triggers Lisa / menu)
POST http://localhost:3000/api/whatsapp/webhook
Content-Type: application/json
{ "entry": [{ "changes": [{ "value": { "messages": [{ "from": "{{JEFF_PHONE}}", "type": "text", "text": { "body": "hello" } }] } }] }] }
# Expected: 200 + WhatsApp message received on phone (interactive menu)
```

Pass condition: You receive a WhatsApp reply on your phone.

---

### Milestone 3 — OCR pipeline works

Build: /lib/whatsapp/ocr.ts + gemini.ts + parser.ts

Update: /tests/whatsapp.http

Tests to include:

```
### Test POST — image message from registered phone
POST http://localhost:3000/api/whatsapp/webhook
Content-Type: application/json
{ "entry": [{ "changes": [{ "value": { "messages": [{ "from": "{{JEFF_PHONE}}", "type": "image", "image": { "id": "{{TEST_IMAGE_ID}}" } }] } }] }] }
# Expected: logs show OCR text extracted + Gemini confidence level returned
```

Pass condition: Vercel/terminal logs show extracted fields and confidence level. No Drive upload or DB save yet.

---

### Milestone 4 — Full save flow

Build: /lib/whatsapp/drive.ts + claims.ts + confidence routing + message_logs table

Update: /tests/whatsapp.http

Pass condition: Send a real receipt photo via WhatsApp → confirmation message received on phone → row appears in claims table in TablePlus → row appears in message_logs table.

---

### Milestone 5 — Session flow (low confidence)

Build: session.ts + button handler

Update: /tests/whatsapp.http

Tests to include:

```
### Test button press — confirm yes
POST http://localhost:3000/api/whatsapp/webhook
Content-Type: application/json
{ "entry": [{ "changes": [{ "value": { "messages": [{ "from": "{{JEFF_PHONE}}", "type": "interactive", "interactive": { "type": "button_reply", "button_reply": { "id": "confirm_yes", "title": "Yes" } } }] } }] }] }
# Expected: session deleted, claim saved, confirmation message sent

### Test button press — confirm no
POST http://localhost:3000/api/whatsapp/webhook
Content-Type: application/json
{ "entry": [{ "changes": [{ "value": { "messages": [{ "from": "{{JEFF_PHONE}}", "type": "interactive", "interactive": { "type": "button_reply", "button_reply": { "id": "confirm_no", "title": "No" } } }] } }] }] }
# Expected: session updated to AWAITING_CORRECTION, correction prompt sent
```

Pass condition: Both button flows work end to end. Check TablePlus for session state changes.

---

### Milestone 6 — Lisa + status checks

Build: Lisa agent + get_status

Update: /tests/whatsapp.http

Tests to include:

```
### Test status query — pending
POST http://localhost:3000/api/whatsapp/webhook
Content-Type: application/json
{ "entry": [{ "changes": [{ "value": { "messages": [{ "from": "{{JEFF_PHONE}}", "type": "text", "text": { "body": "status" } }] } }] }] }
# Expected: WhatsApp reply with pending claims list

### Test status query — summary
POST http://localhost:3000/api/whatsapp/webhook
Content-Type: application/json
{ "entry": [{ "changes": [{ "value": { "messages": [{ "from": "{{JEFF_PHONE}}", "type": "text", "text": { "body": "summary" } }] } }] }] }
# Expected: WhatsApp reply with monthly + YTD summary
```

Pass condition: All status queries return correct formatted WhatsApp messages.

---

## message_logs Table (add to Prisma schema)

Add this to prisma/schema.prisma before Milestone 4:

```
model MessageLog {
  id             String   @id @default(uuid())
  phone          String
  employeeId     String?
  messageType    String   -- text | image | interactive | unknown
  ocrConfidence  String?  -- HIGH | MEDIUM | LOW | null
  processingMs   Int?     -- processing time in milliseconds
  error          String?  -- null if success, error message if failed
  receivedAt     DateTime @default(now())

  employee       Employee? @relation(fields: [employeeId], references: [id])
}
```

Logging rule: fire-and-forget. Never await the log write. Use this pattern:

```tsx
logMessage({ phone, messageType, confidence }).catch(err =>
  console.error('Log write failed silently:', err)
)
// main flow continues immediately — log does not block anything
```

---

## Engineering Rules (WhatsApp specific)

1. Never send base64 image to Gemini/Vision more than once per receipt
2. Always return 200 to Meta webhook immediately — never block on processing
3. Never use  or * in any WhatsApp message body
4. Max 3 buttons in any interactive message
5. Session state machine: IDLE → COLLECTING → deleted (not re-used)
6. One session per phone at a time — check before creating
7. All DB access via Prisma — no raw SQL in route handlers
8. Wrap every external API call (Vision, Gemini, Drive, WhatsApp) in try/catch
9. On any unhandled error → sendTelegramAlert → return 200 to Meta (never crash the webhook)

---

## Meta Webhook Setup (after code is deployed)

1. Deploy to Vercel (auto on git push)
2. Go to Meta Developer Console → WhatsApp → Configuration
3. Set Callback URL to: https://app.auto-settle.com/api/whatsapp/webhook
4. Set Verify Token to: value of WHATSAPP_VERIFY_TOKEN env var
5. Subscribe to: messages
6. Disable the old n8n webhook URL in Meta console
7. Test with a WhatsApp message to the production number

---

## What Is NOT Being Built (out of scope for this migration)

- PDF invoice support (Phase 2 — only image receipts for now)
- Multi-image batch send detection
- Scheduled session cleanup (orphaned sessions over 24hr)
- Google Sheets sync after save
- Admin-specific receipt path differences (simplify to one path for now)
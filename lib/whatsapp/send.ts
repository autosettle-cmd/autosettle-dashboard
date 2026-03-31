const WHATSAPP_API_URL = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

function headers() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function sendTextMessage(to: string, body: string) {
  await fetch(WHATSAPP_API_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
}

export async function sendReaction(
  to: string,
  messageId: string,
  emoji: string
) {
  await fetch(WHATSAPP_API_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "reaction",
      reaction: { message_id: messageId, emoji },
    }),
  });
}

export async function sendInteractiveButtons(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>
) {
  await fetch(WHATSAPP_API_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    }),
  });
}

export async function sendInteractiveMenu(to: string, name: string) {
  await fetch(WHATSAPP_API_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: {
          text: `Hi ${name}! How can I help you today?`,
        },
        action: {
          button: "Menu",
          sections: [
            {
              title: "Options",
              rows: [
                {
                  id: "menu_submit",
                  title: "Submit Receipt",
                  description: "Send a photo of your receipt",
                },
                {
                  id: "menu_status",
                  title: "Check Status",
                  description: "View your pending claims",
                },
                {
                  id: "menu_summary",
                  title: "My Summary",
                  description: "Monthly and yearly totals",
                },
                {
                  id: "menu_help",
                  title: "Help",
                  description: "Get help with Autosettle",
                },
              ],
            },
          ],
        },
      },
    }),
  });
}

export async function sendConfirmationMessage(
  to: string,
  fields: {
    merchant: string;
    amount: number;
    date: string;
    receiptNumber: string;
    category: string;
  }
) {
  const body = [
    "Saved!",
    "",
    `Merchant: ${fields.merchant}`,
    `Amount: RM ${fields.amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Date: ${fields.date}`,
    `Receipt No: ${fields.receiptNumber || "-"}`,
    `Category: ${fields.category}`,
    "",
    "Send your next receipt",
  ].join("\n");

  await sendTextMessage(to, body);
}

export async function sendInvoiceConfirmationMessage(
  to: string,
  fields: {
    vendor: string;
    totalAmount: number;
    issueDate: string;
    dueDate: string;
    invoiceNumber: string;
    category: string;
  }
) {
  const body = [
    "Invoice saved!",
    "",
    `Vendor: ${fields.vendor}`,
    `Amount: RM ${fields.totalAmount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Issue Date: ${fields.issueDate}`,
    `Due Date: ${fields.dueDate || "-"}`,
    `Invoice No: ${fields.invoiceNumber || "-"}`,
    `Category: ${fields.category}`,
    "",
    "Send your next document",
  ].join("\n");

  await sendTextMessage(to, body);
}

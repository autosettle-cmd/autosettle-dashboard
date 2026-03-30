const TELEGRAM_CHAT_ID = "811760571";

export async function sendTelegramAlert({
  error,
  context,
}: {
  error: Error | string;
  context?: {
    location?: string;
    phone?: string;
    messageType?: string;
    messageText?: string;
    step?: string;
  };
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[Telegram] TELEGRAM_BOT_TOKEN not set — skipping alert");
    return;
  }

  const errMsg = error instanceof Error ? error.message : String(error);
  const msgText = context?.messageText
    ? context.messageText.slice(0, 200)
    : "";

  const text = [
    "-- AUTOSETTLE ERROR ALERT --",
    "",
    `Location: ${context?.location || "unknown"}`,
    `Error: ${errMsg}`,
    "",
    "-- User Context --",
    `Phone: ${context?.phone || "unknown"}`,
    `Message Type: ${context?.messageType || "unknown"}`,
    `Message: ${msgText || "N/A"}`,
    `Step: ${context?.step || "N/A"}`,
    "",
    `Time: ${new Date().toISOString()}`,
  ].join("\n");

  try {
    await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
        }),
      }
    );
  } catch (err) {
    console.error("[Telegram] Failed to send alert:", err);
  }
}

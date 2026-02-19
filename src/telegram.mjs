function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function telegramApi({ token, method, payload = {} }) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error (${response.status}) for ${method}: ${body}`);
  }

  const json = await response.json();
  if (!json.ok) {
    throw new Error(`Telegram API returned ok=false for ${method}: ${JSON.stringify(json)}`);
  }

  return json.result;
}

export async function getMe(token) {
  return telegramApi({
    token,
    method: "getMe",
  });
}

export async function getUpdates({
  token,
  offset,
  timeoutSeconds,
}) {
  return telegramApi({
    token,
    method: "getUpdates",
    payload: {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ["message"],
    },
  });
}

export async function sendTelegramMessage({
  token,
  chatId,
  text,
  replyToMessageId,
}) {
  return telegramApi({
    token,
    method: "sendMessage",
    payload: {
      chat_id: chatId,
      text,
      reply_to_message_id: replyToMessageId || undefined,
      disable_web_page_preview: true,
    },
  });
}

export { sleep };

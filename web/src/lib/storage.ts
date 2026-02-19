const CHAT_ID_KEY = "talkeby.chat_id";

export function getStoredChatId() {
  return localStorage.getItem(CHAT_ID_KEY)?.trim() || "";
}

export function setStoredChatId(chatId: string) {
  localStorage.setItem(CHAT_ID_KEY, chatId.trim());
}

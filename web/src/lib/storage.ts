const CHAT_ID_KEY = "talkeby.chat_id";
const THEME_KEY = "talkeby.theme";

export type ThemePreference = "light" | "dark";

export function getStoredChatId() {
  return localStorage.getItem(CHAT_ID_KEY)?.trim() || "";
}

export function setStoredChatId(chatId: string) {
  localStorage.setItem(CHAT_ID_KEY, chatId.trim());
}

export function getStoredTheme(): ThemePreference | "" {
  const value = localStorage.getItem(THEME_KEY)?.trim();
  return value === "light" || value === "dark" ? value : "";
}

export function setStoredTheme(theme: ThemePreference) {
  localStorage.setItem(THEME_KEY, theme);
}

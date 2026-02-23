const CHAT_ID_KEY = "talkeby.chat_id";
const THEME_KEY = "talkeby.theme";
const ACCESS_KEY = "talkeby.access_key";

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

export function getStoredAccessKey() {
  return localStorage.getItem(ACCESS_KEY)?.trim() || "";
}

export function setStoredAccessKey(accessKey: string) {
  localStorage.setItem(ACCESS_KEY, accessKey.trim());
}

export function clearStoredAccessKey() {
  localStorage.removeItem(ACCESS_KEY);
}

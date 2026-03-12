const THEME_KEY = "talkeby.theme";

export type ThemePreference = "light" | "dark";

export function getStoredTheme(): ThemePreference | "" {
  const value = localStorage.getItem(THEME_KEY)?.trim();
  return value === "light" || value === "dark" ? value : "";
}

export function setStoredTheme(theme: ThemePreference) {
  localStorage.setItem(THEME_KEY, theme);
}

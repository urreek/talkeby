import { parseEnv } from "node:util";
import { remotePort } from "../../shared/remote-access.mjs";

export function environmentMap(source, overrides = {}) {
  return new Map(Object.entries({ ...parseEnv(source), ...overrides }));
}

export function environmentBoolean(value, fallback) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function environmentPort(env, kind) {
  return kind === "web"
    ? remotePort(env.get("TALKEBY_WEB_PORT")?.trim() || env.get("WEB_PORT"), 5173, "WEB_PORT")
    : remotePort(env.get("PORT"), 3000, "PORT");
}

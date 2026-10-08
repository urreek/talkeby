export function webPortOptions(env: Record<string, string | undefined>) {
  const value = env.TALKEBY_WEB_PORT?.trim() || env.WEB_PORT?.trim() || "5173";
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid web port. Set TALKEBY_WEB_PORT or WEB_PORT to an integer between 1 and 65535.");
  }
  return { port, strictPort: true };
}

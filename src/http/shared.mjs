export function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isAuthorizedChat(config, chatId) {
  if (config.telegram.allowUnverifiedChats) {
    return true;
  }
  if (config.telegram.allowedChatIds.size === 0) {
    return false;
  }
  return config.telegram.allowedChatIds.has(String(chatId));
}

import { getMe, getUpdates, sleep } from "../telegram.mjs";
import { handleTextMessage } from "./command-handler.mjs";

export { createTelegramMessenger } from "./formatters.mjs";

export async function pollTelegramForever({
  config,
  app,
  state,
  eventBus,
  jobRunner,
  sendChatText,
}) {
  const me = await getMe(config.telegram.botToken);
  app.log.info(`Connected to Telegram bot @${me.username || "unknown"}`);

  let offset = 0;
  if (config.telegram.dropPendingUpdates) {
    const pending = await getUpdates({
      token: config.telegram.botToken,
      offset: 0,
      timeoutSeconds: 0,
    });
    if (pending.length > 0) {
      offset = pending[pending.length - 1].update_id + 1;
      app.log.info(`Dropped ${pending.length} pending updates on startup`);
    }
  }

  while (true) {
    try {
      const updates = await getUpdates({
        token: config.telegram.botToken,
        offset,
        timeoutSeconds: config.telegram.pollTimeoutSeconds,
      });

      for (const update of updates) {
        offset = update.update_id + 1;
        if (!update.message) {
          continue;
        }
        await handleTextMessage({
          config,
          state,
          eventBus,
          jobRunner,
          sendChatText,
          message: update.message,
        });
      }
    } catch (error) {
      app.log.error({ err: error }, "Telegram poll loop error");
      await sleep(config.telegram.retryDelayMs);
    }
  }
}

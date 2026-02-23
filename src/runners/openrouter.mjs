import { runWithAider } from "./aider.mjs";

export async function run(config) {
  return await runWithAider({
    ...config,
    provider: "openrouter",
    defaultModel: "deepseek/deepseek-r1:free",
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

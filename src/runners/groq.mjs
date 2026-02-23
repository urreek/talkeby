import { runWithAider } from "./aider.mjs";

export async function run(config) {
  return await runWithAider({
    ...config,
    provider: "groq",
    defaultModel: "llama-3.1-8b-instant",
    apiKey: process.env.GROQ_API_KEY,
  });
}

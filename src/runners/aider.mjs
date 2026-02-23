import { spawn } from "node:child_process";

function pickModel(config) {
  const model = String(config.model || "").trim();
  if (model) {
    return model;
  }
  return String(config.defaultModel || "").trim();
}

function buildArgs(config) {
  const args = ["--yes", "--no-pretty", "--message", config.task];

  if (config.provider === "groq") {
    args.push("--model", `groq/${config.model}`);
  } else if (config.provider === "openrouter") {
    args.push("--model", `openrouter/${config.model}`);
  } else {
    throw new Error(`Unsupported Aider provider "${config.provider}".`);
  }

  return args;
}

export async function runWithAider(config) {
  const binary = config.binary || "aider";
  const model = pickModel(config);
  if (!model) {
    throw new Error(`No model configured for provider "${config.provider}".`);
  }

  const args = buildArgs({
    provider: config.provider,
    task: config.task,
    model,
  });

  const env = {
    ...process.env,
  };
  if (config.provider === "groq") {
    env.GROQ_API_KEY = String(config.apiKey || "").trim();
  }
  if (config.provider === "openrouter") {
    env.OPENROUTER_API_KEY = String(config.apiKey || "").trim();
  }

  if (!env.GROQ_API_KEY && config.provider === "groq") {
    throw new Error("GROQ_API_KEY is required for Groq provider.");
  }
  if (!env.OPENROUTER_API_KEY && config.provider === "openrouter") {
    throw new Error("OPENROUTER_API_KEY is required for OpenRouter provider.");
  }

  return await spawnAider({
    binary,
    args,
    workdir: config.workdir,
    timeoutMs: config.timeoutMs,
    onLine: config.onLine,
    env,
    signal: config.signal,
  });
}

function spawnAider({ binary, args, workdir, timeoutMs, onLine, env, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: workdir,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000);
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onLine) {
        for (const line of text.split("\n")) {
          if (line.trim()) onLine(line);
        }
      }
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onLine) {
        for (const line of text.split("\n")) {
          if (line.trim()) onLine(`[stderr] ${line}`);
        }
      }
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (killed) {
        reject(new Error("Aider execution timed out."));
        return;
      }
      if (code !== 0 && code !== null) {
        const err = new Error(stderr.trim() || `Aider exited with code ${code}`);
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
        return;
      }
      const message = stdout.trim() || "Aider completed but returned no summary.";
      resolve({ message });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    if (signal) {
      if (signal.aborted) {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1200);
        clearTimeout(timeout);
        reject(new Error("Run cancelled by user."));
        return;
      }
      signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1200);
        clearTimeout(timeout);
        reject(new Error("Run cancelled by user."));
      }, { once: true });
    }

    child.stdin?.end();
  });
}

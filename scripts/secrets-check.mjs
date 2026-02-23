#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_PREFIXES = [
  "node_modules/",
  "web/node_modules/",
  "dist/",
  "web/dist/",
  "logs/",
];

const SKIP_SUFFIXES = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".pdf",
  ".db",
  ".sqlite",
  ".woff",
  ".woff2",
  ".ttf",
];

const SENSITIVE_ASSIGNMENT_KEYS = [
  "APP_ACCESS_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "TELEGRAM_BOT_TOKEN",
];

const PLACEHOLDER_VALUES = new Set([
  "",
  "\"\"",
  "''",
  "<key>",
  "<token>",
  "<secret>",
  "replace-me",
  "choose-a-long-random-secret",
  "123456789:YOUR_BOT_TOKEN",
]);

function listTrackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to list tracked files with git ls-files.");
  }
  return String(result.stdout || "")
    .split("\0")
    .map((value) => value.trim())
    .filter(Boolean);
}

function shouldSkipFile(file) {
  if (SKIP_PREFIXES.some((prefix) => file.startsWith(prefix))) {
    return true;
  }
  if (SKIP_SUFFIXES.some((suffix) => file.endsWith(suffix))) {
    return true;
  }
  return false;
}

function isProbablyText(buffer) {
  return !buffer.includes(0);
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

function isPlaceholderValue(value) {
  const normalized = String(value || "").trim();
  if (PLACEHOLDER_VALUES.has(normalized)) {
    return true;
  }
  if (normalized.includes("YOUR_")) {
    return true;
  }
  if (normalized.includes("<") || normalized.includes(">")) {
    return true;
  }
  return false;
}

function findSensitiveAssignments(text) {
  const findings = [];
  const keyPattern = SENSITIVE_ASSIGNMENT_KEYS.join("|");
  const regex = new RegExp(`^\\s*(${keyPattern})\\s*=\\s*([^\\n#]+)`, "gm");
  for (const match of text.matchAll(regex)) {
    const key = match[1];
    const value = String(match[2] || "").trim();
    if (!value || isPlaceholderValue(value)) {
      continue;
    }
    findings.push({
      type: "assignment",
      key,
      index: match.index || 0,
      sample: `${key}=***`,
    });
  }
  return findings;
}

function findPatternMatches(text) {
  const patterns = [
    {
      type: "openai",
      regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
      sample: "sk-***",
    },
    {
      type: "github",
      regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
      sample: "gh*_***",
    },
    {
      type: "telegram",
      regex: /\b\d{8,}:[A-Za-z0-9_-]{30,}\b/g,
      sample: "telegram_token",
    },
    {
      type: "aws",
      regex: /\bAKIA[0-9A-Z]{16}\b/g,
      sample: "AKIA***",
    },
    {
      type: "private_key",
      regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/g,
      sample: "PRIVATE KEY block",
    },
  ];

  const findings = [];
  for (const item of patterns) {
    for (const match of text.matchAll(item.regex)) {
      findings.push({
        type: item.type,
        index: match.index || 0,
        sample: item.sample,
      });
    }
  }
  return findings;
}

function scanFile(file) {
  const absolutePath = path.join(ROOT_DIR, file);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const buffer = fs.readFileSync(absolutePath);
  if (!isProbablyText(buffer)) {
    return [];
  }

  const text = buffer.toString("utf8");
  const findings = [
    ...findSensitiveAssignments(text),
    ...findPatternMatches(text),
  ];

  return findings.map((finding) => ({
    file,
    line: lineNumberForIndex(text, finding.index),
    type: finding.type,
    sample: finding.sample,
  }));
}

function main() {
  const files = listTrackedFiles().filter((file) => !shouldSkipFile(file));
  const findings = [];
  for (const file of files) {
    findings.push(...scanFile(file));
  }

  if (findings.length > 0) {
    // eslint-disable-next-line no-console
    console.error("[secrets-check] Potential secrets detected in tracked files:");
    for (const finding of findings.slice(0, 50)) {
      // eslint-disable-next-line no-console
      console.error(`- ${finding.file}:${finding.line} (${finding.type}) ${finding.sample}`);
    }
    if (findings.length > 50) {
      // eslint-disable-next-line no-console
      console.error(`...and ${findings.length - 50} more`);
    }
    process.exitCode = 1;
    return;
  }

  // eslint-disable-next-line no-console
  console.log("[secrets-check] OK");
}

try {
  main();
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(`[secrets-check] ${error?.message || error}`);
  process.exitCode = 1;
}

import crypto from "node:crypto";

import { textValue } from "./shared.mjs";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function pathOnly(url) {
  return String(url || "").split("?")[0];
}

function base64UrlEncode(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value), "base64url").toString("utf8");
}

function signPayload(payloadB64, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
}

function createCsrfManager({ secret, ttlMs }) {
  function issue(chatId) {
    const expiresAt = Date.now() + ttlMs;
    const payload = JSON.stringify({
      chatId: String(chatId),
      exp: expiresAt,
      nonce: crypto.randomUUID(),
    });
    const payloadB64 = base64UrlEncode(payload);
    const signature = signPayload(payloadB64, secret);
    return {
      token: `${payloadB64}.${signature}`,
      expiresAt,
    };
  }

  function verify({ chatId, token }) {
    const safeToken = textValue(token);
    if (!safeToken || !safeToken.includes(".")) {
      return false;
    }
    const [payloadB64, signature] = safeToken.split(".");
    if (!payloadB64 || !signature) {
      return false;
    }

    const expected = signPayload(payloadB64, secret);
    if (signature.length !== expected.length) {
      return false;
    }
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return false;
    }

    try {
      const parsed = JSON.parse(base64UrlDecode(payloadB64));
      if (!parsed || String(parsed.chatId) !== String(chatId)) {
        return false;
      }
      const exp = Number(parsed.exp);
      if (!Number.isFinite(exp) || exp <= Date.now()) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  return {
    issue,
    verify,
  };
}

class FixedWindowLimiter {
  constructor({ windowMs, maxPerWindow }) {
    this.windowMs = windowMs;
    this.maxPerWindow = maxPerWindow;
    this.buckets = new Map();
  }

  consume(key) {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return true;
    }

    if (existing.count >= this.maxPerWindow) {
      return false;
    }
    existing.count += 1;
    return true;
  }
}

function resolveChatIdForRequest(request) {
  return textValue(
    request.body?.chatId
    || request.query?.chatId
    || "",
  );
}

function resolveConfiguredOwnerChatId(config) {
  const configuredOwnerChatId = textValue(config.security?.ownerChatId || "");
  if (configuredOwnerChatId) {
    return configuredOwnerChatId;
  }

  const allowed = Array.from(config.telegram?.allowedChatIds || [])
    .map((id) => textValue(id))
    .filter(Boolean);
  if (allowed.length === 1) {
    return allowed[0];
  }
  return "";
}

function resolveOwnerChatIdForRequest(request, config, isRequestOwnerKeyAuthorized) {
  const resolvedOwnerChatId = resolveConfiguredOwnerChatId(config);
  if (!resolvedOwnerChatId) {
    return "";
  }
  if (!isRequestOwnerKeyAuthorized(request)) {
    return "";
  }
  return resolvedOwnerChatId;
}

function isApiPath(url) {
  return pathOnly(url).startsWith("/api/");
}

function isCsrfExemptPath(url) {
  const value = pathOnly(url);
  return value.startsWith("/api/security/csrf");
}

function isOwnerKeyExemptPath(url) {
  const value = pathOnly(url);
  return value.startsWith("/api/security/access");
}

function readOwnerKeyFromRequest(request) {
  const direct = textValue(
    request.headers["x-talkeby-key"]
    || request.headers["x-app-key"]
    || "",
  );
  if (direct) {
    return direct;
  }

  const authorization = textValue(request.headers.authorization || "");
  if (!authorization) {
    return "";
  }

  const match = authorization.match(/^bearer\s+(.+)$/i);
  return match?.[1] ? textValue(match[1]) : "";
}

function secureStringEquals(left, right) {
  const safeLeft = String(left || "");
  const safeRight = String(right || "");
  if (!safeLeft || !safeRight || safeLeft.length !== safeRight.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(safeLeft), Buffer.from(safeRight));
}

export function registerSecurityHooks({ app, config }) {
  const limiter = new FixedWindowLimiter({
    windowMs: 60_000,
    maxPerWindow: config.security.rateLimitPerMinute,
  });
  const ownerKey = textValue(config.security.ownerKey || "");
  const ownerKeyRequired = Boolean(ownerKey);
  const csrf = createCsrfManager({
    secret: config.security.csrfSecret,
    ttlMs: config.security.csrfTtlMs,
  });

  function isRequestOwnerKeyAuthorized(request) {
    if (!ownerKeyRequired) {
      return true;
    }
    const supplied = readOwnerKeyFromRequest(request);
    return secureStringEquals(supplied, ownerKey);
  }

  app.addHook("onRequest", async (request, reply) => {
    const requestPath = String(request.raw.url || "");
    if (!isApiPath(requestPath)) {
      return;
    }

    if (!isOwnerKeyExemptPath(requestPath) && !isRequestOwnerKeyAuthorized(request)) {
      reply.code(401).send({
        error: "Invalid access key.",
        code: "owner_key_invalid",
      });
      return;
    }

    const routeKey = String(request.routerPath || requestPath.split("?")[0] || requestPath);
    const key = `${request.ip}:${request.method}:${routeKey}`;
    const allowed = limiter.consume(key);
    if (allowed) {
      return;
    }

    reply.code(429).send({
      error: "Rate limit exceeded. Please wait before retrying.",
    });
  });

  app.addHook("preHandler", async (request, reply) => {
    const requestPath = String(request.raw.url || "");
    if (!isApiPath(requestPath)) {
      return;
    }
    if (SAFE_METHODS.has(String(request.method || "").toUpperCase())) {
      return;
    }
    if (isCsrfExemptPath(requestPath)) {
      return;
    }

    const chatId = resolveChatIdForRequest(request)
      || resolveOwnerChatIdForRequest(request, config, isRequestOwnerKeyAuthorized);
    if (!chatId) {
      reply.code(400).send({
        error: "chatId is required for mutating requests.",
      });
      return reply;
    }

    const token = textValue(request.headers["x-csrf-token"] || "");
    if (!csrf.verify({ chatId, token })) {
      reply.code(403).send({
        error: "Invalid or expired CSRF token.",
        code: "csrf_invalid",
      });
      return reply;
    }
  });

  return {
    issueCsrfToken(chatId) {
      return csrf.issue(chatId);
    },
    isOwnerKeyRequired() {
      return ownerKeyRequired;
    },
    isOwnerKeyValidForRequest(request) {
      return isRequestOwnerKeyAuthorized(request);
    },
    getOwnerChatId() {
      return resolveConfiguredOwnerChatId(config);
    },
    resolveOwnerChatIdForRequest(request) {
      return resolveOwnerChatIdForRequest(request, config, isRequestOwnerKeyAuthorized);
    },
  };
}

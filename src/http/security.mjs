import crypto from "node:crypto";

import { OWNER_SUBJECT_ID } from "../services/owner-context.mjs";
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

function parseCookies(cookieHeader) {
  const cookies = new Map();
  const raw = String(cookieHeader || "");
  if (!raw) {
    return cookies;
  }

  for (const entry of raw.split(";")) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }
    cookies.set(key, value);
  }
  return cookies;
}

function serializeCookie(name, value, {
  maxAgeSeconds,
  secure,
}) {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (Number.isFinite(maxAgeSeconds)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  }
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function isSecureRequest(request) {
  if (request.protocol === "https") {
    return true;
  }
  const forwardedProto = textValue(request.headers["x-forwarded-proto"] || "");
  return forwardedProto.toLowerCase() === "https";
}

function createSessionManager({ secret, ttlMs }) {
  function issue() {
    const expiresAt = Date.now() + ttlMs;
    const payload = JSON.stringify({
      sub: OWNER_SUBJECT_ID,
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

  function verify(token) {
    const safeToken = textValue(token);
    if (!safeToken || !safeToken.includes(".")) {
      return null;
    }

    const [payloadB64, signature] = safeToken.split(".");
    if (!payloadB64 || !signature) {
      return null;
    }

    const expected = signPayload(payloadB64, secret);
    if (signature.length !== expected.length) {
      return null;
    }
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }

    try {
      const parsed = JSON.parse(base64UrlDecode(payloadB64));
      if (!parsed || String(parsed.sub) !== OWNER_SUBJECT_ID) {
        return null;
      }
      const exp = Number(parsed.exp);
      if (!Number.isFinite(exp) || exp <= Date.now()) {
        return null;
      }
      return {
        sub: OWNER_SUBJECT_ID,
        exp,
        nonce: textValue(parsed.nonce || ""),
      };
    } catch {
      return null;
    }
  }

  return {
    issue,
    verify,
  };
}

function createCsrfManager({ secret, ttlMs }) {
  function issue(sessionNonce) {
    const expiresAt = Date.now() + ttlMs;
    const payload = JSON.stringify({
      sub: OWNER_SUBJECT_ID,
      nonce: String(sessionNonce || ""),
      exp: expiresAt,
    });
    const payloadB64 = base64UrlEncode(payload);
    const signature = signPayload(payloadB64, secret);
    return {
      token: `${payloadB64}.${signature}`,
      expiresAt,
    };
  }

  function verify({ sessionNonce, token }) {
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
      if (!parsed || String(parsed.sub) !== OWNER_SUBJECT_ID) {
        return false;
      }
      if (String(parsed.nonce || "") !== String(sessionNonce || "")) {
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

function secureStringEquals(left, right) {
  const safeLeft = String(left || "");
  const safeRight = String(right || "");
  if (!safeLeft || !safeRight || safeLeft.length !== safeRight.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(safeLeft), Buffer.from(safeRight));
}

function isApiPath(url) {
  return pathOnly(url).startsWith("/api/");
}

function isAuthPublicPath(url) {
  const value = pathOnly(url);
  return value === "/api/auth/login" || value === "/api/auth/session";
}

function isCsrfExemptPath(url) {
  const value = pathOnly(url);
  return value === "/api/auth/login" || value === "/api/security/csrf";
}

function readSessionCookie(request, cookieName) {
  const cookies = parseCookies(request.headers.cookie || "");
  return textValue(cookies.get(cookieName) || "");
}

function buildImplicitOwnerSession() {
  return {
    sub: OWNER_SUBJECT_ID,
    exp: Number.MAX_SAFE_INTEGER,
    nonce: "public-owner-session",
  };
}

function readAccessKey(value) {
  return textValue(value || "");
}

export function registerSecurityHooks({ app, config }) {
  const limiter = new FixedWindowLimiter({
    windowMs: 60_000,
    maxPerWindow: config.security.rateLimitPerMinute,
  });
  const ownerKey = textValue(config.security.ownerKey || "");
  const ownerKeyRequired = Boolean(ownerKey);
  const sessionManager = createSessionManager({
    secret: config.security.csrfSecret,
    ttlMs: config.security.sessionTtlMs,
  });
  const csrf = createCsrfManager({
    secret: config.security.csrfSecret,
    ttlMs: config.security.csrfTtlMs,
  });

  function resolveOwnerSession(request) {
    if (!ownerKeyRequired) {
      return buildImplicitOwnerSession();
    }
    const token = readSessionCookie(request, config.security.sessionCookieName);
    return sessionManager.verify(token);
  }

  app.addHook("onRequest", async (request, reply) => {
    const requestPath = String(request.raw.url || "");
    if (!isApiPath(requestPath)) {
      return;
    }

    const routeKey = String(request.routerPath || pathOnly(requestPath));
    const key = `${request.ip}:${request.method}:${routeKey}`;
    if (!limiter.consume(key)) {
      reply.code(429).send({
        error: "Rate limit exceeded. Please wait before retrying.",
      });
      return;
    }

    const ownerSession = resolveOwnerSession(request);
    request.ownerSession = ownerSession;

    if (!isAuthPublicPath(requestPath) && !ownerSession) {
      reply.code(401).send({
        error: "Authentication required.",
        code: "owner_session_missing",
      });
    }
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

    const ownerSession = request.ownerSession || resolveOwnerSession(request);
    if (!ownerSession) {
      reply.code(401).send({
        error: "Authentication required.",
        code: "owner_session_missing",
      });
      return reply;
    }

    const token = textValue(request.headers["x-csrf-token"] || "");
    if (!csrf.verify({ sessionNonce: ownerSession.nonce, token })) {
      reply.code(403).send({
        error: "Invalid or expired CSRF token.",
        code: "csrf_invalid",
      });
      return reply;
    }
  });

  return {
    getSessionStatus(request) {
      const ownerSession = request.ownerSession || resolveOwnerSession(request);
      return {
        required: ownerKeyRequired,
        authenticated: Boolean(ownerSession),
      };
    },
    issueOwnerSession(reply, request) {
      const issued = sessionManager.issue();
      reply.header("Set-Cookie", serializeCookie(
        config.security.sessionCookieName,
        issued.token,
        {
          maxAgeSeconds: config.security.sessionTtlMs / 1000,
          secure: isSecureRequest(request),
        },
      ));
      return issued;
    },
    clearOwnerSession(reply, request) {
      reply.header("Set-Cookie", serializeCookie(
        config.security.sessionCookieName,
        "",
        {
          maxAgeSeconds: 0,
          secure: isSecureRequest(request),
        },
      ));
    },
    issueCsrfToken(request) {
      const ownerSession = request.ownerSession || resolveOwnerSession(request);
      if (!ownerSession) {
        return null;
      }
      return csrf.issue(ownerSession.nonce);
    },
    isOwnerKeyRequired() {
      return ownerKeyRequired;
    },
    isValidOwnerKey(value) {
      if (!ownerKeyRequired) {
        return true;
      }
      return secureStringEquals(readAccessKey(value), ownerKey);
    },
    requireOwnerSession(request) {
      return request.ownerSession || resolveOwnerSession(request);
    },
  };
}

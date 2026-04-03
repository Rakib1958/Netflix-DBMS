/**
 * Log sanitization: redact secrets, JWTs, URLs; safe console.error/log/warn wrappers.
 */
export function rotateString(input, shift = 13) {
  const s = String(input ?? "");
  const n = Number.isFinite(shift) ? ((shift % 26) + 26) % 26 : 13;

  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      out += String.fromCharCode(((c - 65 + n) % 26) + 65);
      continue;
    }
    if (c >= 97 && c <= 122) {
      out += String.fromCharCode(((c - 97 + n) % 26) + 97);
      continue;
    }
    out += s[i];
  }
  return out;
}

export function redact(value, { showStart = 2, showEnd = 2, rotate = true } = {}) {
  if (value == null) return value;
  const s = String(value);
  if (s.length <= showStart + showEnd) return "***";
  const mid = s.slice(showStart, s.length - showEnd);
  const maskedMid = rotate ? rotateString(mid) : "***";
  return `${s.slice(0, showStart)}${maskedMid}${s.slice(s.length - showEnd)}`;
}

export function redactEmail(email) {
  if (!email) return email;
  const s = String(email);
  const at = s.indexOf("@");
  if (at <= 1) return "***";
  return `${s[0]}***${s.slice(at)}`;
}

export function scrubCredentialsInString(str) {
  if (!str || typeof str !== "string") return str;
  return str.replace(/([a-z+]+:\/\/)([^:/?#\s]+):([^@/]+)@/gi, "$1$2:***@");
}

function isSensitiveKey(k) {
  const key = String(k).toLowerCase();
  if (key === "email") return true;
  return (
    key.includes("password") ||
    key.includes("passwd") ||
    key.includes("pwd") ||
    key.includes("secret") ||
    key.includes("token") ||
    key.includes("apikey") ||
    key.includes("api_key") ||
    key.includes("api-key") ||
    key.includes("authorization") ||
    key.includes("cookie") ||
    key.includes("set-cookie") ||
    key.includes("jwt") ||
    key.includes("bearer") ||
    key.includes("otp") ||
    key.includes("credential") ||
    key.includes("tmdb_token") ||
    key.includes("tmdb_api") ||
    key.includes("genai") ||
    key.includes("gemini") ||
    key.includes("database_url") ||
    key.includes("connection_string") ||
    key.includes("refresh") ||
    key.endsWith("_hash") ||
    key.includes("private_key") ||
    key.includes("access_key")
  );
}

function looksLikeJwt(s) {
  return /^eyJ[a-z0-9_-]+\.[a-z0-9._-]*/i.test(s);
}

export function sanitizeForLog(value, depth = 0, maxDepth = 12) {
  if (value === undefined) return value;
  if (value === null) return value;
  if (depth > maxDepth) return "[max-depth]";

  if (typeof value === "string") {
    let s = scrubCredentialsInString(value);
    if (s.length > 240) return redact(s, { showStart: 4, showEnd: 4 });
    if (looksLikeJwt(s)) return redact(s, { showStart: 8, showEnd: 6 });
    if (/^[A-Za-z0-9._-]{24,}$/.test(s)) return redact(s, { showStart: 4, showEnd: 4 });
    return s;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return "[bigint]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeForLog(scrubCredentialsInString(value.message), depth + 1, maxDepth),
      code: value.code,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, depth + 1, maxDepth));
  }

  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSensitiveKey(k)) {
        if (v == null) out[k] = v;
        else if (typeof v === "string")
          out[k] = k.toLowerCase().includes("email") ? redactEmail(v) : redact(v);
        else out[k] = sanitizeForLog(v, depth + 1, maxDepth);
      } else {
        out[k] = sanitizeForLog(v, depth + 1, maxDepth);
      }
    }
    return out;
  }

  return "[unsupported]";
}

export function safeError(msg, ...rest) {
  console.error(msg, ...rest.map((a) => sanitizeForLog(a)));
}

export function safeWarn(...args) {
  console.warn(...args.map((a) => sanitizeForLog(a)));
}

export function safeInfo(...args) {
  console.log(...args.map((a) => sanitizeForLog(a)));
}

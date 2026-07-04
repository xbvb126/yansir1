import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_AUTH_TOKEN_SECRET = "dev-radar-secret";

export type AuthTokenPayload = {
  sub: string;
  role: string;
  iat: number;
  exp: number;
};

export function createAuthToken(user: { id: string; role: string }) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthTokenPayload = {
    sub: user.id,
    role: user.role,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAuthHeader(authHeader?: string) {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !safeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AuthTokenPayload;
  if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

function sign(value: string) {
  return createHmac("sha256", getAuthTokenSecret())
    .update(value)
    .digest("base64url");
}

export function getAuthTokenSecretStatus() {
  const configured = Boolean(process.env.AUTH_TOKEN_SECRET);
  return {
    configured,
    usingDefault: !configured || process.env.AUTH_TOKEN_SECRET === DEFAULT_AUTH_TOKEN_SECRET
  };
}

function getAuthTokenSecret() {
  return process.env.AUTH_TOKEN_SECRET || DEFAULT_AUTH_TOKEN_SECRET;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

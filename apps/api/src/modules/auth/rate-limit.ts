import { HttpException, HttpStatus } from "@nestjs/common";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return;
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: "Too many requests",
        retryAfterSeconds
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }

  bucket.count += 1;
}

export function getClientIp(request: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
  const forwardedFor = request.headers?.["x-forwarded-for"];
  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0] || request.ip || "unknown";
  }

  return forwardedFor?.split(",")[0]?.trim() || request.ip || "unknown";
}

import { connectDB } from "./db";
import RateLimit from "@/models/RateLimit";
import { HttpError } from "./auth";

/** Best-effort client identity behind Vercel's proxy. */
export function clientIp(req: Request) {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Increments a counter and throws 429 once it exceeds `limit` inside `windowSec`.
 * Fails open: if the database is unreachable we'd rather serve the request than
 * lock every user out of signing in.
 */
export async function rateLimit(
  bucket: string,
  identifier: string,
  { limit = 10, windowSec = 300 } = {}
) {
  try {
    await connectDB();
    const key = `${bucket}:${identifier}`;
    const now = new Date();

    const doc = await RateLimit.findOneAndUpdate(
      { key },
      {
        $inc: { count: 1 },
        $setOnInsert: { key, expiresAt: new Date(now.getTime() + windowSec * 1000) },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // A stale window that Mongo hasn't reaped yet — restart the count.
    if (doc.expiresAt < now) {
      await RateLimit.updateOne(
        { key },
        { $set: { count: 1, expiresAt: new Date(now.getTime() + windowSec * 1000) } }
      );
      return;
    }

    if (doc.count > limit) {
      const retryIn = Math.max(1, Math.ceil((doc.expiresAt.getTime() - now.getTime()) / 1000));
      throw new HttpError(429, `Too many attempts. Try again in ${retryIn > 60 ? `${Math.ceil(retryIn / 60)} minutes` : `${retryIn} seconds`}.`);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.warn("[rate-limit] unavailable, allowing request:", err);
  }
}

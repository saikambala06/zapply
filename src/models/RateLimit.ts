import mongoose, { Schema, model, models } from "mongoose";

/**
 * MongoDB-backed rate limiting.
 *
 * An in-memory counter is useless on Vercel — each serverless instance gets its
 * own memory, so an attacker just spreads requests across instances. Storing
 * counters in Mongo with a TTL index makes the limit global and self-cleaning.
 */
const RateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

// Mongo's background reaper deletes documents once expiresAt passes.
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default models.RateLimit || model("RateLimit", RateLimitSchema);

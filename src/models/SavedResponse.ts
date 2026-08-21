import mongoose, { Schema, model, models } from "mongoose";

/**
 * Every custom question the extension couldn't answer gets stored here once the
 * user types an answer. Next time a similar question shows up on any site, the
 * normalized key matches and we fill it automatically.
 */
const SavedResponseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    question: { type: String, required: true },
    normalizedKey: { type: String, required: true, index: true },
    aliases: { type: [String], default: [] },
    category: { type: String, default: "general" },
    answer: { type: String, default: "" },
    inputType: { type: String, default: "text" },      // text | textarea | select | radio | checkbox
    options: { type: [String], default: [] },          // for select/radio, the choice we picked
    source: { type: String, enum: ["user", "ai", "imported"], default: "user" },
    ats: String,
    lastDomain: String,
    useCount: { type: Number, default: 0 },
    lastUsedAt: Date,
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

SavedResponseSchema.index({ userId: 1, normalizedKey: 1 }, { unique: true });

/** Lowercase, strip punctuation/filler so "Why do you want to work here?" == "why do you want to work here" */
export function normalizeQuestion(q: string) {
  return q
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(please|kindly|the|a|an|your|you|us|our|this|that|is|are|do|does|did|of|to|for|in|on|at|we|and|or|if|will|would|can|could|may)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export type SavedResponseDoc = mongoose.InferSchemaType<typeof SavedResponseSchema> & { _id: string };
export default models.SavedResponse || model("SavedResponse", SavedResponseSchema);

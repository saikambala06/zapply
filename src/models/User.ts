import mongoose, { Schema, model, models } from "mongoose";

const SettingsSchema = new Schema(
  {
    autofillOnLoad: { type: Boolean, default: false },     // fill as soon as a form is detected
    autoPilot: { type: Boolean, default: false },          // fill + advance + submit
    showOverlay: { type: Boolean, default: false },         // the status pill on the page
    trackAutomatically: { type: Boolean, default: true },  // log applications on submit
    reuseSavedResponses: { type: Boolean, default: true },
    aiAnswers: { type: Boolean, default: false },          // Premium: generate unknown answers
    fillDelayMs: { type: Number, default: 120 },
    dailyGoal: { type: Number, default: 10 },
    excludedDomains: { type: [String], default: [] },
    theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String },
    name: { type: String, trim: true },
    avatarUrl: String,
    provider: { type: String, enum: ["credentials", "google", "linkedin"], default: "credentials" },
    providerId: String,

    plan: { type: String, enum: ["free", "premium"], default: "free" },
    trialEndsAt: Date,
    premiumUntil: Date,
    stripeCustomerId: String,
    stripeSubscriptionId: String,

    activeProfileId: { type: Schema.Types.ObjectId, ref: "Profile" },

    // 6-character code shown in the dashboard to pair the browser extension
    pairingCode: { type: String, index: true },
    pairingCodeExpires: Date,

    // Password reset + email confirmation. Only hashes are stored.
    emailVerified: { type: Boolean, default: false },
    verifyTokenHash: { type: String, index: true },
    verifyTokenExpires: Date,
    resetTokenHash: { type: String, index: true },
    resetTokenExpires: Date,

    settings: { type: SettingsSchema, default: () => ({}) },
    onboardedAt: Date,
    lastSeenAt: Date,
  },
  { timestamps: true }
);

UserSchema.methods.isPremium = function () {
  const now = Date.now();
  const trial = this.trialEndsAt && new Date(this.trialEndsAt).getTime() > now;
  const paid = this.premiumUntil && new Date(this.premiumUntil).getTime() > now;
  return this.plan === "premium" || Boolean(trial || paid);
};

export type UserDoc = mongoose.InferSchemaType<typeof UserSchema> & { _id: string };
export default models.User || model("User", UserSchema);

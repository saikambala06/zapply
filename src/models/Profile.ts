import mongoose, { Schema, model, models } from "mongoose";

/**
 * A complete applicant profile — everything an ATS ever asks for.
 * Free users get one; Premium users can keep several (one per target role)
 * and have them scored against each job posting.
 */

const EducationSchema = new Schema(
  {
    school: String,
    degree: String,          // "Bachelor's Degree"
    fieldOfStudy: String,
    gpa: String,
    startDate: String,       // YYYY-MM
    endDate: String,
    current: { type: Boolean, default: false },
    location: String,
    description: String,
  },
  { _id: true }
);

const ExperienceSchema = new Schema(
  {
    company: String,
    title: String,
    employmentType: String,  // Full-time / Internship / Contract
    location: String,
    locationType: String,    // On-site / Remote / Hybrid
    startDate: String,
    endDate: String,
    current: { type: Boolean, default: false },
    description: String,
  },
  { _id: true }
);

const WebsiteSchema = new Schema(
  { label: String, url: String },   // LinkedIn / GitHub / Portfolio / Other
  { _id: true }
);

const DocumentSchema = new Schema(
  {
    kind: { type: String, enum: ["resume", "coverLetter", "transcript", "other"], default: "resume" },
    name: String,
    mimeType: String,
    size: Number,
    // Base64 data URL. Small files only; swap for S3/UploadThing in production.
    dataUrl: String,
    isDefault: { type: Boolean, default: false },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const EeoSchema = new Schema(
  {
    gender: String,
    race: String,                    // Race / Ethnicity
    hispanicLatino: String,
    veteranStatus: String,
    disabilityStatus: String,
    disabilitySignatureName: String,
    disabilitySignatureDate: String,
    declineToSelfIdentify: { type: Boolean, default: false },
  },
  { _id: false }
);

const WorkAuthSchema = new Schema(
  {
    // The four questions every US application asks, in the order they ask them.
    authorizedToWork: { type: String, default: "Yes" },     // Yes / No
    requireSponsorship: { type: String, default: "No" },    // Yes / No
    workAuthType: String,                                    // Citizen / Green Card / H-1B / F-1 OPT ...
    visaStatus: String,
    willingToRelocate: { type: String, default: "Yes" },
    remotePreference: String,
    availableStartDate: String,
    noticePeriod: String,
    over18: { type: String, default: "Yes" },
    previouslyEmployedHere: { type: String, default: "No" },
    referredBy: String,
    howDidYouHear: String,
    securityClearance: String,
    driversLicense: String,
    willingToDrugTest: { type: String, default: "Yes" },
    willingToBackgroundCheck: { type: String, default: "Yes" },
  },
  { _id: false }
);

const CompensationSchema = new Schema(
  {
    desiredSalary: String,
    currentSalary: String,
    salaryCurrency: { type: String, default: "USD" },
    salaryPeriod: { type: String, default: "year" },
  },
  { _id: false }
);

const ProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, default: "Default profile" },   // "Frontend roles", "PM roles"
    targetRole: String,
    color: { type: String, default: "#5B2AD6" },
    isDefault: { type: Boolean, default: false },

    personal: {
      firstName: String,
      middleName: String,
      lastName: String,
      preferredName: String,
      pronouns: String,
      email: String,
      phone: String,
      phoneCountryCode: { type: String, default: "+1" },
      phoneType: { type: String, default: "Mobile" },
      dateOfBirth: String,
      address: String,
      addressLine2: String,
      city: String,
      state: String,
      zip: String,
      country: { type: String, default: "United States" },
      nationality: String,
      citizenship: String,
      languages: { type: [String], default: [] },
    },

    websites: { type: [WebsiteSchema], default: [] },
    education: { type: [EducationSchema], default: [] },
    experience: { type: [ExperienceSchema], default: [] },
    skills: { type: [String], default: [] },
    certifications: { type: [String], default: [] },
    documents: { type: [DocumentSchema], default: [] },

    workAuth: { type: WorkAuthSchema, default: () => ({}) },
    compensation: { type: CompensationSchema, default: () => ({}) },
    eeo: { type: EeoSchema, default: () => ({}) },

    summary: String,          // used by AI answer generation
    completeness: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/** Percentage used by the dashboard "profile strength" meter. */
ProfileSchema.methods.computeCompleteness = function () {
  const p = this as any;
  const checks = [
    p.personal?.firstName, p.personal?.lastName, p.personal?.email, p.personal?.phone,
    p.personal?.city, p.personal?.country,
    p.education?.length, p.experience?.length, p.skills?.length, p.websites?.length,
    p.documents?.some((d: any) => d.kind === "resume"),
    p.workAuth?.authorizedToWork, p.eeo?.gender || p.eeo?.declineToSelfIdentify,
    p.summary,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
};

ProfileSchema.pre("save", function (next) {
  // @ts-ignore - method defined above
  this.completeness = this.computeCompleteness();
  next();
});

export type ProfileDoc = mongoose.InferSchemaType<typeof ProfileSchema> & { _id: string };
export default models.Profile || model("Profile", ProfileSchema);

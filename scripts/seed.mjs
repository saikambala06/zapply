/**
 * Seeds a demo account so you can click through the dashboard immediately.
 *
 *   npm run seed
 *
 * Requires MONGODB_URI and JWT_SECRET in .env.local.
 * Login: demo@zapply.dev / demo1234
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { MONGODB_URI } = process.env;
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI in .env.local first.");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;

const EMAIL = "demo@zapply.dev";
const PASSWORD = "demo1234";

// Wipe any previous demo data so re-running is safe.
const existing = await db.collection("users").findOne({ email: EMAIL });
if (existing) {
  await Promise.all([
    db.collection("profiles").deleteMany({ userId: existing._id }),
    db.collection("applications").deleteMany({ userId: existing._id }),
    db.collection("savedresponses").deleteMany({ userId: existing._id }),
    db.collection("users").deleteOne({ _id: existing._id }),
  ]);
}

const now = new Date();
const userId = new mongoose.Types.ObjectId();

await db.collection("users").insertOne({
  _id: userId,
  email: EMAIL,
  name: "Demo Candidate",
  passwordHash: await bcrypt.hash(PASSWORD, 10),
  provider: "credentials",
  plan: "free",
  trialEndsAt: new Date(Date.now() + 3 * 86_400_000),
  settings: {
    autofillOnLoad: false, autoPilot: false, showOverlay: true,
    trackAutomatically: true, reuseSavedResponses: true, aiAnswers: false,
    fillDelayMs: 120, dailyGoal: 10, excludedDomains: [], theme: "system",
  },
  onboardedAt: now,
  createdAt: now,
  updatedAt: now,
});

const profileId = new mongoose.Types.ObjectId();
await db.collection("profiles").insertOne({
  _id: profileId,
  userId,
  label: "Software engineering",
  targetRole: "Senior Frontend Engineer",
  isDefault: true,
  color: "#5B2AD6",
  personal: {
    firstName: "Aarav", middleName: "", lastName: "Mehta", preferredName: "Aarav",
    pronouns: "he/him", email: EMAIL, phone: "4155550142", phoneCountryCode: "+1",
    phoneType: "Mobile", address: "440 Bryant St", addressLine2: "Apt 3B",
    city: "San Francisco", state: "CA", zip: "94107", country: "United States",
    languages: ["English", "Hindi"],
  },
  websites: [
    { label: "LinkedIn", url: "https://linkedin.com/in/aaravmehta" },
    { label: "GitHub", url: "https://github.com/aaravmehta" },
    { label: "Portfolio", url: "https://aarav.dev" },
  ],
  experience: [
    { company: "Stripe", title: "Software Engineer", employmentType: "Full-time",
      location: "San Francisco, CA", startDate: "2021-03", current: true,
      description: "Payments infrastructure. Rebuilt webhook delivery with idempotency keys and replay tooling." },
    { company: "Cobalt Labs", title: "Junior Engineer", employmentType: "Full-time",
      location: "Remote", startDate: "2019-06", endDate: "2021-02", current: false,
      description: "Built the customer dashboard in React and the billing integration." },
  ],
  education: [
    { school: "UC Berkeley", degree: "Bachelor's Degree", fieldOfStudy: "Computer Science",
      gpa: "3.8", startDate: "2015-08", endDate: "2019-05", current: false },
  ],
  skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "GraphQL", "AWS"],
  certifications: ["AWS Solutions Architect Associate"],
  documents: [],
  workAuth: {
    authorizedToWork: "Yes", requireSponsorship: "No", workAuthType: "US Citizen",
    willingToRelocate: "Yes", remotePreference: "Hybrid",
    availableStartDate: "2026-09-14", noticePeriod: "Two weeks",
    over18: "Yes", previouslyEmployedHere: "No", howDidYouHear: "LinkedIn",
    securityClearance: "None", willingToDrugTest: "Yes", willingToBackgroundCheck: "Yes",
  },
  compensation: { desiredSalary: "185000", salaryCurrency: "USD", salaryPeriod: "year" },
  eeo: {
    gender: "Male", race: "Asian", hispanicLatino: "No",
    veteranStatus: "I am not a protected veteran",
    disabilityStatus: "No, I don't have a disability",
    declineToSelfIdentify: false,
  },
  summary: "Product-minded engineer with five years on payments infrastructure. I like problems where correctness and latency both matter.",
  completeness: 93,
  createdAt: now,
  updatedAt: now,
});

await db.collection("users").updateOne({ _id: userId }, { $set: { activeProfileId: profileId } });

/* ---- applications spread over the last eight weeks ---- */
const COMPANIES = [
  ["Northwind", "Senior Product Engineer", "greenhouse", "interview"],
  ["Cobalt Labs", "Frontend Engineer II", "lever", "screen"],
  ["Harbor", "Full-Stack Engineer", "ashby", "applied"],
  ["Kestrel", "Platform Engineer", "workday", "applied"],
  ["Lumen", "Software Engineer, Growth", "greenhouse", "rejected"],
  ["Meridian", "Senior Software Engineer", "lever", "offer"],
  ["Alder", "Product Engineer", "ashby", "applied"],
  ["Quill", "Frontend Engineer", "workable", "ghosted"],
  ["Basalt", "Staff Engineer", "greenhouse", "applied"],
  ["Vireo", "Senior Frontend Engineer", "smartrecruiters", "screen"],
  ["Tessel", "Software Engineer", "icims", "rejected"],
  ["Fathom", "Engineer, Platform", "workday", "applied"],
];

const applications = [];
for (let i = 0; i < 46; i++) {
  const [company, title, ats, stage] = COMPANIES[i % COMPANIES.length];
  const daysAgo = Math.floor((i / 46) * 54) + Math.floor(Math.random() * 3);
  const appliedAt = new Date(Date.now() - daysAgo * 86_400_000);
  const filled = 18 + Math.floor(Math.random() * 14);

  applications.push({
    userId,
    profileId,
    jobTitle: i < COMPANIES.length ? title : `${title} (${Math.floor(i / COMPANIES.length) + 1})`,
    company,
    companyDomain: `${company.toLowerCase().replace(/\s+/g, "")}.com`,
    location: ["San Francisco, CA", "Remote", "New York, NY", "Austin, TX"][i % 4],
    url: `https://boards.${ats}.io/${company.toLowerCase()}/jobs/${4000 + i}`,
    ats,
    source: "extension",
    stage: i < COMPANIES.length ? stage : "applied",
    appliedAt,
    lastActivityAt: appliedAt,
    autofill: { fieldsDetected: filled + 4, fieldsFilled: filled, durationMs: 2200 + Math.random() * 3000 },
    events: [{ stage: "applied", at: appliedAt }],
    tags: [],
    favorite: false,
    createdAt: appliedAt,
    updatedAt: appliedAt,
  });
}
await db.collection("applications").insertMany(applications);

/* ---- saved answers ---- */
const normalize = (q) =>
  q.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(please|kindly|the|a|an|your|you|us|our|this|that|is|are|do|does|did|of|to|for|in|on|at|we|and|or|if|will|would|can|could|may)\b/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 180);

const RESPONSES = [
  ["Why are you interested in this role?", "The scope lines up with what I've been doing on payments infrastructure, and I want to work somewhere correctness is treated as a feature rather than a cleanup task.", "textarea", 34],
  ["What are your salary expectations?", "$185,000", "text", 41],
  ["Are you legally authorized to work in the United States?", "Yes", "select", 58],
  ["Will you now or in the future require sponsorship?", "No", "select", 55],
  ["When can you start?", "Two weeks from an offer.", "text", 29],
  ["Describe a project you're proud of.", "I rebuilt our webhook delivery pipeline: exponential backoff, idempotency keys, and a replay tool that cut support escalations by about two thirds.", "textarea", 22],
  ["How did you hear about this position?", "LinkedIn", "select", 37],
  ["What's your greatest strength?", "I'm unusually willing to read the source of the thing that's misbehaving instead of guessing around it.", "textarea", 12],
];

await db.collection("savedresponses").insertMany(
  RESPONSES.map(([question, answer, inputType, useCount]) => ({
    userId,
    question,
    normalizedKey: normalize(question),
    answer,
    inputType,
    options: [],
    source: "user",
    useCount,
    lastUsedAt: new Date(Date.now() - Math.random() * 7 * 86_400_000),
    pinned: false,
    createdAt: now,
    updatedAt: now,
  }))
);

console.log(`
  Seeded the demo account.

    email     ${EMAIL}
    password  ${PASSWORD}

    ${applications.length} applications, ${RESPONSES.length} saved answers, 1 profile
`);

await mongoose.disconnect();

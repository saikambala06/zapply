import { connectDB } from "@/lib/db";
import Application from "@/models/Application";
import { requireUser } from "@/lib/auth";
import { ok, handler } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  await connectDB();

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const q = searchParams.get("q");
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);

  const filter: Record<string, unknown> = { userId: user._id };
  if (stage && stage !== "all") filter.stage = stage;
  if (q) {
    filter.$or = [
      { jobTitle: { $regex: q, $options: "i" } },
      { company: { $regex: q, $options: "i" } },
      { location: { $regex: q, $options: "i" } },
    ];
  }

  const rows = await Application.find(filter).sort({ appliedAt: -1 }).limit(limit).lean();
  return ok(rows.map((r) => ({ ...r, _id: String(r._id), userId: String(r.userId) })));
});

const Body = z.object({
  jobTitle: z.string().min(1, "Add the job title"),
  company: z.string().optional(),
  location: z.string().optional(),
  url: z.string().optional(),
  ats: z.string().optional(),
  stage: z.string().optional(),
  salaryRange: z.string().optional(),
  notes: z.string().optional(),
  appliedAt: z.string().optional(),
  source: z.enum(["extension", "manual", "import"]).optional(),
  autofill: z.record(z.any()).optional(),
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  await connectDB();
  const body = Body.parse(await req.json());

  const doc = await Application.findOneAndUpdate(
    { userId: user._id, url: body.url || undefined },
    {
      $set: {
        ...body,
        userId: user._id,
        appliedAt: body.appliedAt ? new Date(body.appliedAt) : new Date(),
        lastActivityAt: new Date(),
      },
      $setOnInsert: { events: [{ stage: body.stage || "applied", at: new Date() }] },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return ok({ ...doc.toObject(), _id: String(doc._id) }, 201);
});

import { connectDB } from "@/lib/db";
import SavedResponse, { normalizeQuestion } from "@/models/SavedResponse";
import { requireUser } from "@/lib/auth";
import { ok, handler } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  await connectDB();
  const q = new URL(req.url).searchParams.get("q");
  const filter: Record<string, unknown> = { userId: user._id };
  if (q) filter.question = { $regex: q, $options: "i" };

  const rows = await SavedResponse.find(filter).sort({ pinned: -1, useCount: -1, updatedAt: -1 }).lean();
  return ok(rows.map((r) => ({ ...r, _id: String(r._id), userId: String(r.userId) })));
});

const Body = z.object({
  question: z.string().min(2, "Add the question text"),
  answer: z.string().default(""),
  inputType: z.string().optional(),
  options: z.array(z.string()).optional(),
  ats: z.string().optional(),
  lastDomain: z.string().optional(),
  source: z.enum(["user", "ai", "imported"]).optional(),
  category: z.string().max(80).optional(),
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  await connectDB();
  const body = Body.parse(await req.json());

  const doc = await SavedResponse.findOneAndUpdate(
    { userId: user._id, normalizedKey: normalizeQuestion(body.question) },
    {
      $set: { ...body, userId: user._id, normalizedKey: normalizeQuestion(body.question) },
      $addToSet: { aliases: body.question },
      $setOnInsert: { useCount: 0 },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return ok({ ...doc.toObject(), _id: String(doc._id) }, 201);
});

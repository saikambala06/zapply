import { connectDB } from "@/lib/db";
import SavedResponse, { normalizeQuestion } from "@/models/SavedResponse";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const body = await req.json();
  if (body.question) body.normalizedKey = normalizeQuestion(body.question);

  const doc = await SavedResponse.findOneAndUpdate(
    { _id: params.id, userId: user._id },
    { $set: body },
    { new: true }
  );
  if (!doc) return fail("We couldn't find that saved answer.", 404);
  return ok({ ...doc.toObject(), _id: String(doc._id) });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const res = await SavedResponse.findOneAndDelete({ _id: params.id, userId: user._id });
  if (!res) return fail("We couldn't find that saved answer.", 404);
  return ok({ deleted: true });
});

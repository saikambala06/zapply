import { connectDB } from "@/lib/db";
import Application from "@/models/Application";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const body = await req.json();

  const app = await Application.findOne({ _id: params.id, userId: user._id });
  if (!app) return fail("We couldn't find that application.", 404);

  if (body.stage && body.stage !== app.stage) {
    app.events.push({ stage: body.stage, at: new Date(), note: body.note });
  }
  Object.assign(app, body, { lastActivityAt: new Date() });
  await app.save();

  return ok({ ...app.toObject(), _id: String(app._id) });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const res = await Application.findOneAndDelete({ _id: params.id, userId: user._id });
  if (!res) return fail("We couldn't find that application.", 404);
  return ok({ deleted: true });
});

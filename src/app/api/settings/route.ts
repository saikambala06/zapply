import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { requireUser } from "@/lib/auth";
import { ok, handler } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  return ok((user as any).settings ?? {});
});

export const PATCH = handler(async (req: Request) => {
  const user = await requireUser();
  await connectDB();
  const body = await req.json();

  const updated = await User.findByIdAndUpdate(
    user._id,
    { $set: Object.fromEntries(Object.entries(body).map(([k, v]) => [`settings.${k}`, v])) },
    { new: true }
  ).select("settings");

  return ok(updated?.settings ?? {});
});

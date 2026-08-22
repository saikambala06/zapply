import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import SavedResponse from "@/models/SavedResponse";
import ResponsesManager from "@/components/dashboard/ResponsesManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved answers" };

export default async function ResponsesPage() {
  const user = await requireUser();
  await connectDB();
  const rows = await SavedResponse.find({ userId: user._id })
    .sort({ pinned: -1, useCount: -1, updatedAt: -1 })
    .lean();
  const serialized = JSON.parse(JSON.stringify(rows.map((r) => ({ ...r, _id: String(r._id) }))));
  return <ResponsesManager initial={serialized} />;
}

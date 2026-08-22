import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Application from "@/models/Application";
import ApplicationTable from "@/components/dashboard/ApplicationTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const user = await requireUser();
  await connectDB();
  const rows = await Application.find({ userId: user._id }).sort({ appliedAt: -1 }).limit(500).lean();
  const serialized = JSON.parse(JSON.stringify(rows.map((r) => ({ ...r, _id: String(r._id) }))));
  return <ApplicationTable initial={serialized} />;
}

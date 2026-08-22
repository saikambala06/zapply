import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Profile from "@/models/Profile";
import ProfileWorkspace from "@/components/dashboard/ProfileWorkspace";
import { isPremium } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  await connectDB();

  // `documents.dataUrl` holds the base64 resume. The editor only needs the file
  // name and size, and shipping megabytes of base64 into the page payload made
  // every save round-trip it back again.
  let profiles: any[] = await Profile.find({ userId: user._id })
    .select("-documents.dataUrl")
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();

  if (!profiles.length) {
    const created = await Profile.create({
      userId: user._id,
      isDefault: true,
      personal: { email: (user as any).email },
    });
    profiles = [created.toObject()];
  }

  const serialized = JSON.parse(
    JSON.stringify(profiles.map((p) => ({ ...p, _id: String(p._id) })))
  );

  return <ProfileWorkspace profiles={serialized} premium={isPremium(user)} />;
}

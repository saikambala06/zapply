import { requireUser } from "@/lib/auth";
import SettingsPanel from "@/components/dashboard/SettingsPanel";
import { isPremium } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = JSON.parse(JSON.stringify((user as any).settings ?? {}));
  return <SettingsPanel initial={settings} email={(user as any).email} premium={isPremium(user)} />;
}

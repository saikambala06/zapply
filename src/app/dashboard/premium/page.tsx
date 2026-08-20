import { requireUser } from "@/lib/auth";
import { isPremium, trialDaysLeft } from "@/lib/plan";
import PremiumPanel from "@/components/dashboard/PremiumPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Premium" };

export default async function PremiumPage() {
  const user = await requireUser();
  return (
    <PremiumPanel
      premium={isPremium(user)}
      trialUsed={Boolean((user as any).trialEndsAt)}
      trialDaysLeft={trialDaysLeft(user)}
    />
  );
}

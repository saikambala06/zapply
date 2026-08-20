import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Sidebar from "@/components/dashboard/Sidebar";
import { isPremium, trialDaysLeft } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const account = {
    name: (user as any).name ?? "",
    email: (user as any).email as string,
    premium: isPremium(user),
    trialDaysLeft: trialDaysLeft(user),
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <Sidebar account={account} />
      <div className="min-w-0 bg-canvas">
        <div className="mx-auto w-full max-w-[1080px] px-5 py-6 sm:px-8 sm:py-10">{children}</div>
      </div>
    </div>
  );
}

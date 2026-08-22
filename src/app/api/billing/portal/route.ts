import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";

export const dynamic = "force-dynamic";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Stripe billing portal — where an existing subscriber changes card, views
 * invoices or cancels. This is deliberately NOT the checkout route: sending a
 * current subscriber to checkout creates a *second* subscription.
 */
export const POST = handler(async () => {
  const user = await requireUser();
  await connectDB();

  const { STRIPE_SECRET_KEY } = process.env;
  const customerId = (user as any).stripeCustomerId;

  if (!STRIPE_SECRET_KEY) {
    // Mock mode: let the user cancel so the flow is still testable.
    await User.findByIdAndUpdate(user._id, { plan: "free", premiumUntil: null });
    return ok({ mock: true, url: `${APP_URL}/dashboard/premium?cancelled=1` });
  }
  if (!customerId) {
    return fail("There's no subscription on this account yet.", 400);
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/dashboard/premium`,
  });

  return ok({ url: session.url });
});

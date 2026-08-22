import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { requireUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Creates a Stripe Checkout session. If Stripe isn't configured the route
 * upgrades the account directly so the rest of the app stays testable.
 */
export const POST = handler(async () => {
  const user = await requireUser();
  await connectDB();

  const { STRIPE_SECRET_KEY, STRIPE_PREMIUM_PRICE_ID } = process.env;

  if (!STRIPE_SECRET_KEY || !STRIPE_PREMIUM_PRICE_ID) {
    await User.findByIdAndUpdate(user._id, {
      plan: "premium",
      premiumUntil: new Date(Date.now() + 30 * 86_400_000),
    });
    return ok({ mock: true, url: `${APP_URL}/dashboard/premium?upgraded=1` });
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  let customerId = (user as any).stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: (user as any).email,
      name: (user as any).name,
      metadata: { userId: String(user._id) },
    });
    customerId = customer.id;
    await User.findByIdAndUpdate(user._id, { stripeCustomerId: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: STRIPE_PREMIUM_PRICE_ID, quantity: 1 }],
    subscription_data: { trial_period_days: (user as any).trialEndsAt ? undefined : 3 },
    success_url: `${APP_URL}/dashboard/premium?upgraded=1`,
    cancel_url: `${APP_URL}/dashboard/premium`,
    client_reference_id: String(user._id),
  });

  if (!session.url) return fail("Stripe didn't return a checkout URL.", 502);
  return ok({ url: session.url });
});

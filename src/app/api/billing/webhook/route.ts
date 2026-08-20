import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { ok, fail, handler } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Stripe subscription lifecycle -> user.plan. Configure the endpoint in Stripe. */
export const POST = handler(async (req: Request) => {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = process.env;
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) return fail("Billing isn't configured.", 503);

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const signature = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature!, STRIPE_WEBHOOK_SECRET);
  } catch {
    return fail("Signature verification failed.", 400);
  }

  await connectDB();
  const obj: any = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const userId = obj.client_reference_id;
      if (userId) {
        await User.findByIdAndUpdate(userId, {
          plan: "premium",
          stripeSubscriptionId: obj.subscription,
          premiumUntil: new Date(Date.now() + 31 * 86_400_000),
        });
      }
      break;
    }
    case "invoice.paid": {
      await User.findOneAndUpdate(
        { stripeCustomerId: obj.customer },
        { plan: "premium", premiumUntil: new Date(Date.now() + 31 * 86_400_000) }
      );
      break;
    }
    case "customer.subscription.deleted":
    case "invoice.payment_failed": {
      await User.findOneAndUpdate({ stripeCustomerId: obj.customer }, { plan: "free" });
      break;
    }
  }

  return ok({ received: true });
});

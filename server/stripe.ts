import Stripe from "stripe";
import type { Express, Request, Response } from "express";
import {
  getUserById,
  getUserByStripeCustomerId,
  setStripeCustomerId,
  updateUserSubscription,
  updateUserSubscriptionByCustomerId,
  requireAuth,
} from "./auth";

// ── Stripe Test Mode Keys ──
// Replace these with your real keys when going to production
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_PLACEHOLDER";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// Product configuration
const MONTHLY_PRICE = 2900; // $29.00 in cents
const PRODUCT_NAME = "Premium Screener Pro";

let stripe: Stripe | null = null;
let priceId: string | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    if (STRIPE_SECRET_KEY === "sk_test_PLACEHOLDER") {
      throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.");
    }
    stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" as any });
  }
  return stripe;
}

// Create or retrieve the subscription price
async function ensurePrice(): Promise<string> {
  if (priceId) return priceId;

  const s = getStripe();

  // Search for existing product
  const products = await s.products.list({ limit: 10 });
  let product = products.data.find(p => p.name === PRODUCT_NAME && p.active);

  if (!product) {
    product = await s.products.create({
      name: PRODUCT_NAME,
      description: "Full access to Premium Screener: 497-ticker live scans, 4 strategies, backtesting, IV rank, trade journal, alerts, and more.",
    });
  }

  // Search for existing price on this product
  const prices = await s.prices.list({ product: product.id, active: true, limit: 10 });
  let price = prices.data.find(p => p.unit_amount === MONTHLY_PRICE && p.recurring?.interval === "month");

  if (!price) {
    price = await s.prices.create({
      product: product.id,
      unit_amount: MONTHLY_PRICE,
      currency: "usd",
      recurring: { interval: "month" },
    });
  }

  priceId = price.id;
  return priceId;
}

export function setupStripe(app: Express) {
  // ── Webhook (must be before json body parser — needs raw body) ──
  // Note: The raw body is captured by the express.json verify option in index.ts

  // POST /api/stripe/create-checkout
  app.post("/api/stripe/create-checkout", requireAuth, async (req: Request, res: Response) => {
    try {
      const s = getStripe();
      const user = getUserById(req.user!.id);
      if (!user) return res.status(401).json({ error: "User not found" });

      // Already subscribed?
      if (user.subscriptionStatus === "active") {
        return res.status(400).json({ error: "Already subscribed" });
      }

      const pId = await ensurePrice();

      // Create or reuse Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await s.customers.create({
          email: user.email,
          metadata: { userId: String(user.id) },
        });
        customerId = customer.id;
        setStripeCustomerId(user.id, customerId);
      }

      // Determine the return URL from the request origin
      const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "http://localhost:5000";

      const session = await s.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: pId, quantity: 1 }],
        success_url: `${origin}/#/?checkout=success`,
        cancel_url: `${origin}/#/?checkout=canceled`,
        subscription_data: {
          metadata: { userId: String(user.id) },
        },
        allow_promotion_codes: true,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Stripe checkout error:", err?.message);
      if (err?.message?.includes("not configured")) {
        return res.status(503).json({ error: "Payment system is being configured. Please try again later." });
      }
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // POST /api/stripe/create-portal — customer portal for managing subscription
  app.post("/api/stripe/create-portal", requireAuth, async (req: Request, res: Response) => {
    try {
      const s = getStripe();
      const user = getUserById(req.user!.id);
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ error: "No subscription found" });
      }

      const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "http://localhost:5000";

      const portalSession = await s.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${origin}/#/`,
      });

      res.json({ url: portalSession.url });
    } catch (err: any) {
      console.error("Stripe portal error:", err?.message);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });

  // POST /api/stripe/webhook
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    try {
      const s = getStripe();
      let event: Stripe.Event;

      if (STRIPE_WEBHOOK_SECRET) {
        const sig = req.headers["stripe-signature"];
        if (!sig) return res.status(400).json({ error: "Missing signature" });
        event = s.webhooks.constructEvent(req.rawBody as any, sig, STRIPE_WEBHOOK_SECRET);
      } else {
        // In test mode without webhook secret, trust the payload
        event = req.body as Stripe.Event;
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.mode === "subscription" && session.customer) {
            const sub = await s.subscriptions.retrieve(session.subscription as string);
            updateUserSubscriptionByCustomerId(
              session.customer as string,
              "active",
              sub.id,
              sub.items.data[0]?.price?.id || null,
              sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
            );
            console.log(`Subscription activated for customer ${session.customer}`);
          }
          break;
        }

        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const status = sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "canceled";
          updateUserSubscriptionByCustomerId(
            sub.customer as string,
            status,
            sub.id,
            sub.items.data[0]?.price?.id || null,
            sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
          );
          console.log(`Subscription ${sub.id} updated: ${status}`);
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          updateUserSubscriptionByCustomerId(
            sub.customer as string,
            "canceled",
            null,
            null,
            sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
          );
          console.log(`Subscription ${sub.id} canceled for customer ${sub.customer}`);
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.customer) {
            const user = getUserByStripeCustomerId(invoice.customer as string);
            if (user) {
              updateUserSubscription(user.id, "past_due", user.stripeSubscriptionId, user.stripePriceId, user.subscriptionEndsAt);
              console.log(`Payment failed for customer ${invoice.customer}`);
            }
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error("Webhook error:", err?.message);
      res.status(400).json({ error: "Webhook processing failed" });
    }
  });

  // GET /api/stripe/status — check if Stripe is configured
  app.get("/api/stripe/status", (_req: Request, res: Response) => {
    const configured = STRIPE_SECRET_KEY !== "sk_test_PLACEHOLDER";
    res.json({
      configured,
      testMode: configured && STRIPE_SECRET_KEY.startsWith("sk_test_"),
      monthlyPrice: "$29",
    });
  });
}

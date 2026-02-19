/** Cloudflare Worker environment bindings */
export interface Env {
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_MONTHLY_PRICE_ID: string;
  STRIPE_ANNUAL_PRICE_ID: string;
  ALLOWED_ORIGIN: string;
}

/** Request body for POST /create-checkout-session */
export interface CreateCheckoutRequest {
  email: string;
  plan: "monthly" | "annual";
}

/** Response from GET /check-license */
export interface LicenseResponse {
  licensed: boolean;
  plan: string;
  expiresAt: string;
}

/** D1 row from the subscriptions table */
export interface SubscriptionRow {
  email: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: "free" | "pro" | "cancelled" | "past_due";
  plan_interval: "month" | "year" | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

/** Stripe Checkout Session (relevant fields only) */
export interface StripeCheckoutSession {
  id: string;
  object: "checkout.session";
  customer: string;
  customer_email: string | null;
  subscription: string | null;
  mode: string;
  status: string;
}

/** Stripe Subscription (relevant fields only) */
export interface StripeSubscription {
  id: string;
  object: "subscription";
  customer: string;
  status: string;
  current_period_end: number;
  items: {
    data: Array<{
      price: {
        id: string;
        recurring: { interval: string } | null;
      };
    }>;
  };
}

/** Stripe webhook event envelope */
export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: StripeCheckoutSession | StripeSubscription;
  };
}

import type {
  Env,
  CreateCheckoutRequest,
  LicenseResponse,
  StripeEvent,
  StripeCheckoutSession,
  StripeSubscription,
  SubscriptionRow,
} from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(env, new Response(null, { status: 204 }));
    }

    try {
      if (url.pathname === "/create-checkout-session" && request.method === "POST") {
        return corsResponse(env, await handleCreateCheckoutSession(request, env));
      }

      if (url.pathname === "/stripe-webhook" && request.method === "POST") {
        // No CORS on webhooks — Stripe calls this directly
        return await handleStripeWebhook(request, env);
      }

      if (url.pathname === "/check-license" && request.method === "GET") {
        return corsResponse(env, await handleCheckLicense(url, env));
      }

      return corsResponse(env, jsonResponse({ error: "Not found" }, 404));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("Unhandled error:", message);
      return corsResponse(env, jsonResponse({ error: message }, 500));
    }
  },
};

// ---------------------------------------------------------------------------
// POST /create-checkout-session
// ---------------------------------------------------------------------------

async function handleCreateCheckoutSession(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as CreateCheckoutRequest;

  if (!body.email || !body.plan) {
    return jsonResponse({ error: "Missing required fields: email, plan" }, 400);
  }

  if (body.plan !== "monthly" && body.plan !== "annual") {
    return jsonResponse({ error: 'plan must be "monthly" or "annual"' }, 400);
  }

  const priceId =
    body.plan === "monthly" ? env.STRIPE_MONTHLY_PRICE_ID : env.STRIPE_ANNUAL_PRICE_ID;

  const params = new URLSearchParams({
    "mode": "subscription",
    "customer_email": body.email,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "success_url": "https://lighttime.app/checkout/success",
    "cancel_url": "https://lighttime.app/checkout/cancel",
  });

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!stripeResponse.ok) {
    const errorBody = await stripeResponse.text();
    console.error("Stripe API error:", errorBody);
    return jsonResponse({ error: "Failed to create checkout session" }, 502);
  }

  const session = (await stripeResponse.json()) as { url: string };
  return jsonResponse({ url: session.url });
}

// ---------------------------------------------------------------------------
// POST /stripe-webhook
// ---------------------------------------------------------------------------

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return jsonResponse({ error: "Missing stripe-signature header" }, 400);
  }

  const event = await verifyWebhookSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!event) {
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as StripeCheckoutSession, env);
      break;

    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as StripeSubscription, env);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as StripeSubscription, env);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return jsonResponse({ received: true });
}

async function handleCheckoutCompleted(session: StripeCheckoutSession, env: Env): Promise<void> {
  const email = session.customer_email;
  if (!email) {
    console.error("checkout.session.completed missing customer_email");
    return;
  }

  // Fetch the full subscription to get current_period_end and interval
  let planInterval: string | null = null;
  let currentPeriodEnd: string | null = null;

  if (session.subscription) {
    const sub = await fetchStripeSubscription(session.subscription, env.STRIPE_SECRET_KEY);
    if (sub) {
      currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
      if (sub.items.data.length > 0 && sub.items.data[0].price.recurring) {
        planInterval = sub.items.data[0].price.recurring.interval;
      }
    }
  }

  await env.DB.prepare(
    `INSERT INTO subscriptions (email, stripe_customer_id, stripe_subscription_id, status, plan_interval, current_period_end, updated_at)
     VALUES (?, ?, ?, 'pro', ?, ?, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET
       stripe_customer_id = excluded.stripe_customer_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       status = 'pro',
       plan_interval = excluded.plan_interval,
       current_period_end = excluded.current_period_end,
       updated_at = datetime('now')`
  )
    .bind(
      email,
      session.customer,
      session.subscription,
      planInterval,
      currentPeriodEnd
    )
    .run();
}

async function handleSubscriptionUpdated(subscription: StripeSubscription, env: Env): Promise<void> {
  const status = mapStripeStatus(subscription.status);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

  let planInterval: string | null = null;
  if (subscription.items.data.length > 0 && subscription.items.data[0].price.recurring) {
    planInterval = subscription.items.data[0].price.recurring.interval;
  }

  await env.DB.prepare(
    `UPDATE subscriptions
     SET status = ?, plan_interval = ?, current_period_end = ?, updated_at = datetime('now')
     WHERE stripe_subscription_id = ?`
  )
    .bind(status, planInterval, currentPeriodEnd, subscription.id)
    .run();
}

async function handleSubscriptionDeleted(subscription: StripeSubscription, env: Env): Promise<void> {
  await env.DB.prepare(
    `UPDATE subscriptions
     SET status = 'cancelled', updated_at = datetime('now')
     WHERE stripe_subscription_id = ?`
  )
    .bind(subscription.id)
    .run();
}

// ---------------------------------------------------------------------------
// GET /check-license?email=...
// ---------------------------------------------------------------------------

async function handleCheckLicense(url: URL, env: Env): Promise<Response> {
  const email = url.searchParams.get("email");

  if (!email) {
    return jsonResponse({ error: "Missing required query parameter: email" }, 400);
  }

  const row = await env.DB.prepare(
    "SELECT status, plan_interval, current_period_end FROM subscriptions WHERE email = ?"
  )
    .bind(email)
    .first<Pick<SubscriptionRow, "status" | "plan_interval" | "current_period_end">>();

  if (!row || row.status !== "pro") {
    const response: LicenseResponse = {
      licensed: false,
      plan: row?.status ?? "free",
      expiresAt: "",
    };
    return jsonResponse(response);
  }

  const response: LicenseResponse = {
    licensed: true,
    plan: "pro",
    expiresAt: row.current_period_end ?? "",
  };
  return jsonResponse(response);
}

// ---------------------------------------------------------------------------
// Stripe webhook signature verification
// ---------------------------------------------------------------------------

async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): Promise<StripeEvent | null> {
  // Parse the signature header: t=<timestamp>,v1=<signature>[,v1=<signature>...]
  const parts = signatureHeader.split(",");
  let timestamp = "";
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") {
      timestamp = value;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return null;
  }

  // Reject timestamps older than 5 minutes to prevent replay attacks
  const eventAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (eventAge > 300) {
    return null;
  }

  // Compute expected signature: HMAC-SHA256(secret, timestamp + "." + payload)
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expectedSignature = arrayBufferToHex(signatureBytes);

  // Constant-time comparison against all provided v1 signatures
  const isValid = signatures.some((sig) => timingSafeEqual(sig, expectedSignature));
  if (!isValid) {
    return null;
  }

  return JSON.parse(payload) as StripeEvent;
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Constant-time string comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ---------------------------------------------------------------------------
// Stripe API helpers
// ---------------------------------------------------------------------------

async function fetchStripeSubscription(
  subscriptionId: string,
  secretKey: string
): Promise<StripeSubscription | null> {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });

  if (!response.ok) {
    console.error("Failed to fetch subscription:", await response.text());
    return null;
  }

  return (await response.json()) as StripeSubscription;
}

function mapStripeStatus(stripeStatus: string): SubscriptionRow["status"] {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "pro";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return "free";
  }
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function corsResponse(env: Env, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

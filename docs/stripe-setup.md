# Stripe Setup Guide — LightTime Pro

**Status:** Reference documentation for BL-1
**Last Updated:** February 19, 2026

---

## Overview

LightTime uses Stripe for subscription billing with two plans:

| Plan | Price | Billing | Savings |
|------|-------|---------|---------|
| LightTime Pro Monthly | $7/month | Recurring | — |
| LightTime Pro Annual | $56/year | Recurring | ~33% vs monthly |

Payments are handled entirely by Stripe Checkout (hosted). The app opens a browser to the Stripe-hosted payment page — no credit card fields are rendered inside the app.

---

## 1. Create a Stripe Account

1. Go to [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Create an account with the business name "LightTime"
3. Complete identity verification when prompted (required before going live)

> All setup below should be done in **Test Mode** first. Toggle the "Test mode" switch in the top-right of the Stripe Dashboard. Test mode uses separate API keys and no real charges are made.

---

## 2. Create the Product

1. Navigate to **Products** in the left sidebar (or go to Products > + Add product)
2. Create one product:
   - **Name:** LightTime Pro
   - **Description:** Full calendar integration, configurable warning windows, custom color intensity and border thickness.
   - **Image:** Upload the LightTime Pro icon (optional, shown on Checkout page)

### 2.1 Add Monthly Price

On the product page, click **Add another price**:

- **Pricing model:** Standard pricing
- **Price:** $7.00
- **Currency:** USD
- **Billing period:** Monthly
- **Price description:** Monthly

Note the generated **Price ID** (starts with `price_`). This is used in the `STRIPE_MONTHLY_PRICE_ID` environment variable.

### 2.2 Add Annual Price

Click **Add another price** again:

- **Pricing model:** Standard pricing
- **Price:** $56.00
- **Currency:** USD
- **Billing period:** Yearly
- **Price description:** Annual (~33% savings)

Note the generated **Price ID**. This is used in the `STRIPE_ANNUAL_PRICE_ID` environment variable.

---

## 3. Configure the Customer Portal

The Customer Portal lets users manage their own subscriptions (cancel, switch plans, update payment method) without contacting support.

1. Navigate to **Settings > Billing > Customer portal** (or search "Customer portal" in Dashboard)
2. Under **Functionality**, enable:
   - **Invoices:** Allow customers to view invoice history
   - **Subscriptions:**
     - Allow customers to cancel subscriptions
     - Allow customers to switch plans (between monthly and annual)
     - Allow customers to update payment methods
   - **Proration:** Prorate when switching plans
3. Under **Business information**:
   - Set the business name to "LightTime"
   - Add a link to your privacy policy and terms of service URLs
4. Under **Appearance**:
   - Customize branding to match LightTime's visual identity (optional)
5. Click **Save**

> The portal URL is generated per-customer via the Stripe API. The app does not need a static portal URL.

---

## 4. Configure Webhooks

Stripe sends events to your backend when subscription state changes. The billing worker listens at `POST /stripe-webhook`.

### 4.1 Add Webhook Endpoint

1. Navigate to **Developers > Webhooks** (or search "Webhooks" in Dashboard)
2. Click **Add endpoint**
3. Set the endpoint URL:
   - **Test mode:** `https://billing-dev.lighttime.app/stripe-webhook`
   - **Production:** `https://billing.lighttime.app/stripe-webhook`
4. Under **Events to send**, select:
   - `checkout.session.completed` — User completed payment
   - `customer.subscription.updated` — Plan change, renewal, payment failure
   - `customer.subscription.deleted` — Subscription cancelled (end of period)
5. Click **Add endpoint**

### 4.2 Get the Webhook Signing Secret

After creating the endpoint:

1. Click on the endpoint to view its details
2. Under **Signing secret**, click **Reveal**
3. Copy the secret (starts with `whsec_`)
4. This is used in the `STRIPE_WEBHOOK_SECRET` environment variable

> In Test mode, you can use the **Send test webhook** button to verify your endpoint responds correctly.

---

## 5. API Keys

### Where to Find Them

Navigate to **Developers > API keys** in the Stripe Dashboard.

### Keys Required

| Key | Environment Variable | Where Used | Description |
|-----|---------------------|------------|-------------|
| Secret key (`sk_test_...` / `sk_live_...`) | `STRIPE_SECRET_KEY` | Cloudflare Worker | Server-side API calls (create checkout sessions, verify webhooks) |
| Publishable key (`pk_test_...` / `pk_live_...`) | Not used server-side | Not used | Only needed if embedding Stripe.js in frontend (we use hosted Checkout) |
| Webhook signing secret (`whsec_...`) | `STRIPE_WEBHOOK_SECRET` | Cloudflare Worker | Verify webhook signatures |

### Environment Variable Summary

All secrets are stored as Cloudflare Workers secrets (encrypted, never in code):

```
STRIPE_SECRET_KEY       — Stripe secret API key
STRIPE_WEBHOOK_SECRET   — Webhook endpoint signing secret
STRIPE_MONTHLY_PRICE_ID — Price ID for $7/month plan
STRIPE_ANNUAL_PRICE_ID  — Price ID for $56/year plan
```

Set them with:

```bash
cd billing/
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_MONTHLY_PRICE_ID
npx wrangler secret put STRIPE_ANNUAL_PRICE_ID
```

> `STRIPE_MONTHLY_PRICE_ID` and `STRIPE_ANNUAL_PRICE_ID` could also be set as plain-text environment variables in `wrangler.toml` since they are not sensitive, but keeping them as secrets allows swapping test/production price IDs without code changes.

---

## 6. Test Mode vs Production Mode

| Aspect | Test Mode | Production Mode |
|--------|-----------|-----------------|
| API keys | `sk_test_...` / `pk_test_...` | `sk_live_...` / `pk_live_...` |
| Charges | No real money charged | Real charges |
| Webhook secrets | Separate per mode | Separate per mode |
| Test card numbers | `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (decline) | Real cards only |
| Customer data | Separate from production | Real customer data |
| Dashboard toggle | "Test mode" switch (top-right) | Default view |

### Testing Checklist

1. Create a test checkout session via `POST /create-checkout-session`
2. Complete payment using test card `4242 4242 4242 4242` (any future expiry, any CVC)
3. Verify the webhook fires and the subscription record appears in D1
4. Verify `GET /check-license` returns `{ licensed: true, plan: "pro", ... }`
5. Cancel the subscription in the Stripe Dashboard
6. Verify the webhook fires and the subscription record is updated
7. Verify `GET /check-license` returns `{ licensed: false, ... }`

### Going Live

1. Complete Stripe account verification (identity, bank account)
2. Create the same product and prices in live mode (or use Stripe's "Copy to live mode" feature)
3. Create a new webhook endpoint pointing to the production worker URL
4. Update Cloudflare Workers secrets with live-mode keys
5. Deploy the worker to production

---

## 7. Step-by-Step Setup Summary

### Initial Setup (Test Mode)

1. Create Stripe account and stay in Test Mode
2. Create "LightTime Pro" product with two prices ($7/month, $56/year)
3. Note both Price IDs
4. Configure Customer Portal (cancel, switch plans, update payment)
5. Add webhook endpoint pointing to your dev worker URL
6. Note the webhook signing secret
7. Copy the test-mode secret API key
8. Set all four secrets in Cloudflare Workers via `wrangler secret put`
9. Deploy the billing worker with `npx wrangler deploy`
10. Run through the testing checklist above

### Production Launch

1. Complete Stripe identity verification
2. Switch Dashboard to live mode
3. Create the same product and prices (or copy from test mode)
4. Add a live-mode webhook endpoint for the production worker URL
5. Update Cloudflare Workers secrets with live-mode keys and price IDs
6. Deploy the billing worker to production
7. Test with a real $7 charge, then refund it

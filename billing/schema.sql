-- LightTime Billing — D1 Database Schema
-- Matches the schema defined in docs/architecture.md

CREATE TABLE subscriptions (
  email TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'free',  -- 'free', 'pro', 'cancelled', 'past_due'
  plan_interval TEXT,                    -- 'month', 'year'
  current_period_end TEXT,               -- ISO 8601
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);

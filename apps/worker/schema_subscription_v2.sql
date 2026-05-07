-- Subscription v2: direct USDT on Ethereum
-- Run: npx wrangler d1 execute labqcpro-db --remote --file=apps/worker/schema_subscription_v2.sql

-- Add tx_hash column to payment_records if not exists
ALTER TABLE payment_records ADD COLUMN tx_hash TEXT;
ALTER TABLE payment_records ADD COLUMN amount_usdt REAL;
ALTER TABLE payment_records ADD COLUMN network TEXT DEFAULT 'ethereum';

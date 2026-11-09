-- deferred
-- Bot purchases, the payment wallet and the spending limit were removed. Their policies, indexes and
-- foreign keys go with the tables.
DROP TABLE IF EXISTS "purchases";
DROP TABLE IF EXISTS "payment_wallets";
DROP TABLE IF EXISTS "payments";
DROP TABLE IF EXISTS "spending_limits";

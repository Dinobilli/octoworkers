-- A placeholder is not an owner. Provision the first real owner explicitly.
DELETE FROM admin_users WHERE email = 'REPLACE_WITH_ADMIN_EMAIL';
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('admin', 'member')),
  subject TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_sessions_subject ON auth_sessions(kind, subject);
CREATE INDEX idx_auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE oauth_states (
  token_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  kakao_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TRIGGER protect_last_owner_update BEFORE UPDATE OF role, is_active ON admin_users
WHEN OLD.role = 'super_admin' AND OLD.is_active = 1
  AND (NEW.role != 'super_admin' OR NEW.is_active != 1)
  AND (SELECT COUNT(*) FROM admin_users WHERE role = 'super_admin' AND is_active = 1) <= 1
BEGIN SELECT RAISE(ABORT, 'last_active_owner'); END;
CREATE TRIGGER protect_last_owner_delete BEFORE DELETE ON admin_users
WHEN OLD.role = 'super_admin' AND OLD.is_active = 1
  AND (SELECT COUNT(*) FROM admin_users WHERE role = 'super_admin' AND is_active = 1) <= 1
BEGIN SELECT RAISE(ABORT, 'last_active_owner'); END;
CREATE TRIGGER revoke_changed_admin AFTER UPDATE OF role, is_active ON admin_users
WHEN OLD.role != NEW.role OR OLD.is_active != NEW.is_active
BEGIN DELETE FROM auth_sessions WHERE kind = 'admin' AND subject = OLD.email; END;
CREATE TRIGGER revoke_deleted_admin AFTER DELETE ON admin_users
BEGIN DELETE FROM auth_sessions WHERE kind = 'admin' AND subject = OLD.email; END;

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  groble_content_id TEXT NOT NULL UNIQUE,
  checkout_url TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK(currency = 'KRW'),
  payment_type TEXT NOT NULL DEFAULT 'ONE_TIME' CHECK(payment_type IN ('ONE_TIME', 'SUBSCRIPTION')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1))
);
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  groble_content_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_orders_member ON orders(member_id, created_at);
-- Verified, normalized provider facts; excludes buyer PII and card data.
-- Derive order state from facts instead of applying updates in delivery order.
CREATE TABLE payment_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  body_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  merchant_uid TEXT,
  seller_reference TEXT,
  content_id TEXT,
  amount INTEGER,
  currency TEXT,
  payment_type TEXT,
  partial_refund INTEGER,
  refund_amount INTEGER,
  refunded_at TEXT,
  service_ends_at TEXT,
  next_billing_date TEXT,
  received_at TEXT NOT NULL
);
CREATE INDEX idx_payment_events_reference ON payment_events(seller_reference, occurred_at);
CREATE INDEX idx_payment_events_merchant ON payment_events(merchant_uid, occurred_at);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

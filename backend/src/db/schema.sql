CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  phone TEXT,
  country TEXT,
  account_type TEXT,
  company_name TEXT,
  terms_accepted_at TIMESTAMPTZ,
  plan_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'not_submitted',
  payment_reference TEXT,
  payment_payer_name TEXT,
  payment_proof_path TEXT,
  payment_submitted_at TIMESTAMPTZ,
  payment_rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facebook_accounts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  meta_user_id TEXT,
  access_token_encrypted TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facebook_pages (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES facebook_accounts(id) ON DELETE CASCADE,
  meta_page_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  page_token_encrypted TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID PRIMARY KEY,
  content TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_post_pages (
  post_id UUID REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  page_id UUID REFERENCES facebook_pages(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled',
  published_post_id TEXT,
  error_message TEXT,
  PRIMARY KEY (post_id, page_id)
);

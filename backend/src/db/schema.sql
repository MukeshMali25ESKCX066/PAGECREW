CREATE TABLE IF NOT EXISTS facebook_accounts (
  id UUID PRIMARY KEY,
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

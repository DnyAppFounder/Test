/*
  # DAWEN Page Studio Schema

  ## Summary
  Creates the full schema for the DAWEN Page Studio feature — a block-based landing page
  and mini-website builder. Users can create, edit, publish, and share public pages.

  ## New Tables

  ### pages
  Main page record. Stores metadata, slug, status, theme, and global settings.
  - id, owner_user_id (fk → user_profiles), owner_wallet (text)
  - title, slug (unique), type, status, theme
  - global_settings, token_mint, token_name, token_symbol, token_logo_url
  - description, og_image_url, preview_token (uuid, unique)
  - is_preview_enabled, is_created_on_dawen_visible, view_count
  - created_at, updated_at, published_at, archived_at

  ### page_blocks
  Individual content blocks within a page.
  - id, page_id (fk), block_type, sort_order
  - content_json, style_json, animation_json, is_hidden
  - created_at, updated_at

  ### page_analytics_events
  Tracks page views, button clicks, and other events.
  - id, page_id (fk), event_type, block_id, visitor_id, session_id
  - referrer, device_type, metadata_json, created_at

  ### page_form_submissions
  Stores whitelist/contact form submissions from public visitors.
  - id, page_id (fk), block_id, wallet_address, x_handle, telegram, email
  - note, signature, verified_wallet, created_at

  ## Security
  - pages: anon SELECT for published/unlisted; all writes through service role only
  - page_blocks: anon SELECT for published parent pages; writes through service role
  - page_analytics_events: anon INSERT for tracking; SELECT for service role
  - page_form_submissions: anon INSERT; SELECT for service role
*/

-- ─── pages ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pages (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id               uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  owner_wallet                text NOT NULL DEFAULT '',
  title                       text NOT NULL DEFAULT 'Untitled Page',
  slug                        text UNIQUE NOT NULL,
  type                        text NOT NULL DEFAULT 'general'
    CHECK (type IN ('token','project','personal','link-in-bio','whitelist','claim','countdown','general')),
  status                      text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','unlisted','archived')),
  theme                       text NOT NULL DEFAULT 'dawen-purple',
  global_settings             jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_mint                  text,
  token_name                  text,
  token_symbol                text,
  token_logo_url              text,
  description                 text,
  og_image_url                text,
  preview_token               text UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  is_preview_enabled          boolean NOT NULL DEFAULT false,
  is_created_on_dawen_visible boolean NOT NULL DEFAULT true,
  view_count                  bigint NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  published_at                timestamptz,
  archived_at                 timestamptz
);

ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

-- Public can read published and unlisted pages
CREATE POLICY "Public can read published pages"
  ON pages FOR SELECT
  USING (status IN ('published', 'unlisted'));

-- ─── page_blocks ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS page_blocks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id        uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_type     text NOT NULL,
  sort_order     integer NOT NULL DEFAULT 0,
  content_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  style_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  animation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_hidden      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE page_blocks ENABLE ROW LEVEL SECURITY;

-- Public can read blocks of published/unlisted pages
CREATE POLICY "Public can read blocks of published pages"
  ON page_blocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pages
      WHERE pages.id = page_blocks.page_id
        AND pages.status IN ('published', 'unlisted')
    )
  );

-- ─── page_analytics_events ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS page_analytics_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  block_id      uuid,
  visitor_id    text,
  session_id    text,
  referrer      text,
  device_type   text,
  metadata_json jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE page_analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert analytics events (public page tracking)
CREATE POLICY "Anyone can insert analytics events"
  ON page_analytics_events FOR INSERT
  WITH CHECK (true);

-- ─── page_form_submissions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS page_form_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_id        uuid,
  wallet_address  text,
  x_handle        text,
  telegram        text,
  email           text,
  note            text,
  signature       text,
  verified_wallet boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE page_form_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone can submit form (whitelist/contact)
CREATE POLICY "Anyone can submit page forms"
  ON page_form_submissions FOR INSERT
  WITH CHECK (true);

-- ─── page_button_clicks ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS page_button_clicks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_id      uuid,
  button_label  text,
  button_action text,
  target_url    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE page_button_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert button clicks"
  ON page_button_clicks FOR INSERT
  WITH CHECK (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_owner_wallet ON pages(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_pages_owner_user_id ON pages(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
CREATE INDEX IF NOT EXISTS idx_pages_preview_token ON pages(preview_token);
CREATE INDEX IF NOT EXISTS idx_page_blocks_page_id ON page_blocks(page_id);
CREATE INDEX IF NOT EXISTS idx_page_blocks_sort ON page_blocks(page_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_page_analytics_page_id ON page_analytics_events(page_id);
CREATE INDEX IF NOT EXISTS idx_page_analytics_created ON page_analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_page_form_submissions_page_id ON page_form_submissions(page_id);
CREATE INDEX IF NOT EXISTS idx_page_button_clicks_page_id ON page_button_clicks(page_id);

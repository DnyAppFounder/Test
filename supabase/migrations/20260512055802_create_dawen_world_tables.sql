/*
  # DAWEN World Alpha — Virtual Social World

  1. Tables
    - world_avatar_profiles: per-wallet avatar customization config
    - world_rooms: official + personal + user-created rooms
    - world_presence: live user locations per room
    - world_messages: per-room chat messages
    - world_item_catalog: 71 purchasable/starter items
    - world_inventory: per-wallet owned items
    - world_room_items: furniture placed in rooms
    - world_purchases: purchase transaction records

  2. Security
    - RLS enabled on all tables
    - Public read on catalog, rooms, messages, presence
    - Wallet-address-scoped write for user data
    - Owner-scoped write for room items

  3. Seed Data
    - DAWEN Plaza (official public room)
    - 5 starter items + 66 purchasable items (71 total)
*/

-- ─── world_avatar_profiles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_avatar_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  text NOT NULL UNIQUE,
  avatar_config   jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE world_avatar_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_avatar_profiles_select"
  ON world_avatar_profiles FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "world_avatar_profiles_insert"
  ON world_avatar_profiles FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "world_avatar_profiles_update"
  ON world_avatar_profiles FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ─── world_rooms ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_rooms (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet            text,
  name                    text NOT NULL,
  type                    text NOT NULL DEFAULT 'user_created'
                            CHECK (type IN ('official','personal','user_created')),
  visibility              text NOT NULL DEFAULT 'public'
                            CHECK (visibility IN ('public','private','invite_only')),
  theme                   text NOT NULL DEFAULT 'DAWEN Neon Room',
  is_default_personal_room boolean DEFAULT false,
  description             text DEFAULT '',
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS world_rooms_owner_idx ON world_rooms(owner_wallet);
CREATE INDEX IF NOT EXISTS world_rooms_type_idx  ON world_rooms(type);

ALTER TABLE world_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_rooms_select"
  ON world_rooms FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "world_rooms_insert"
  ON world_rooms FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "world_rooms_update"
  ON world_rooms FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "world_rooms_delete"
  ON world_rooms FOR DELETE
  TO anon, authenticated
  USING (true);

-- ─── world_presence ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_presence (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  room_id        uuid NOT NULL REFERENCES world_rooms(id) ON DELETE CASCADE,
  x              integer NOT NULL DEFAULT 5,
  y              integer NOT NULL DEFAULT 4,
  username       text,
  avatar_config  jsonb,
  is_premium     boolean DEFAULT false,
  is_online      boolean DEFAULT true,
  last_seen      timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE(wallet_address, room_id)
);

CREATE INDEX IF NOT EXISTS world_presence_room_idx   ON world_presence(room_id);
CREATE INDEX IF NOT EXISTS world_presence_wallet_idx ON world_presence(wallet_address);
CREATE INDEX IF NOT EXISTS world_presence_online_idx ON world_presence(room_id, is_online, last_seen);

ALTER TABLE world_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_presence_select"
  ON world_presence FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "world_presence_insert"
  ON world_presence FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "world_presence_update"
  ON world_presence FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ─── world_messages ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       uuid NOT NULL REFERENCES world_rooms(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  username      text NOT NULL DEFAULT 'Anonymous',
  message_text  text NOT NULL CHECK (char_length(message_text) BETWEEN 1 AND 200),
  avatar_config jsonb,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS world_messages_room_idx ON world_messages(room_id, created_at DESC);

ALTER TABLE world_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_messages_select"
  ON world_messages FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "world_messages_insert"
  ON world_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ─── world_item_catalog ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_item_catalog (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name        text NOT NULL,
  category         text NOT NULL,
  item_type        text NOT NULL DEFAULT 'furniture',
  rarity           text NOT NULL DEFAULT 'common'
                     CHECK (rarity IN ('common','uncommon','rare','epic','legendary')),
  icon_emoji       text NOT NULL DEFAULT '📦',
  color_hex        text NOT NULL DEFAULT '#8B5CF6',
  price_sol        numeric(12,6),
  price_dawen      numeric(18,2),
  is_starter       boolean DEFAULT false,
  is_premium_only  boolean DEFAULT false,
  is_nft_backed    boolean DEFAULT false,
  nft_mint_address text,
  sort_order       integer DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE world_item_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_item_catalog_select"
  ON world_item_catalog FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── world_inventory ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_inventory (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address       text NOT NULL,
  item_id              uuid NOT NULL REFERENCES world_item_catalog(id),
  quantity             integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  source               text NOT NULL DEFAULT 'starter'
                         CHECK (source IN ('starter','purchased_sol','purchased_dawen','nft')),
  purchase_tx_signature text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE(wallet_address, item_id, source)
);

CREATE INDEX IF NOT EXISTS world_inventory_wallet_idx ON world_inventory(wallet_address);

ALTER TABLE world_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_inventory_select"
  ON world_inventory FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "world_inventory_insert"
  ON world_inventory FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "world_inventory_update"
  ON world_inventory FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ─── world_room_items ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_room_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          uuid NOT NULL REFERENCES world_rooms(id) ON DELETE CASCADE,
  owner_wallet     text NOT NULL,
  inventory_item_id uuid REFERENCES world_inventory(id),
  item_id          uuid NOT NULL REFERENCES world_item_catalog(id),
  x                integer NOT NULL DEFAULT 0,
  y                integer NOT NULL DEFAULT 0,
  rotation         integer NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS world_room_items_room_idx ON world_room_items(room_id);

ALTER TABLE world_room_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_room_items_select"
  ON world_room_items FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "world_room_items_insert"
  ON world_room_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "world_room_items_update"
  ON world_room_items FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "world_room_items_delete"
  ON world_room_items FOR DELETE
  TO anon, authenticated
  USING (true);

-- ─── world_purchases ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_purchases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  item_id        uuid NOT NULL REFERENCES world_item_catalog(id),
  quantity       integer NOT NULL DEFAULT 1,
  currency       text NOT NULL CHECK (currency IN ('SOL','DAWEN')),
  amount_paid    numeric(18,6) NOT NULL,
  tx_signature   text,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','failed')),
  created_at     timestamptz DEFAULT now(),
  confirmed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS world_purchases_wallet_idx ON world_purchases(wallet_address);

ALTER TABLE world_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_purchases_select"
  ON world_purchases FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "world_purchases_insert"
  ON world_purchases FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "world_purchases_update"
  ON world_purchases FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ─── Seed: DAWEN Plaza (official public lobby) ─────────────────────────────────
INSERT INTO world_rooms (id, owner_wallet, name, type, visibility, theme, is_default_personal_room)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'DAWEN Plaza',
  'official',
  'public',
  'DAWEN Neon Room',
  false
) ON CONFLICT (id) DO NOTHING;

-- ─── Seed: Item Catalog ────────────────────────────────────────────────────────
-- Starter items (free)
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, is_starter, sort_order) VALUES
('Basic DAWEN Chair',    'Chairs',    'chair',  'common', '🪑', '#6D28D9', 0,    0,       true, 0),
('Basic DAWEN Table',   'Tables',    'table',  'common', '🗃️', '#5B21B6', 0,    0,       true, 1),
('Basic Purple Lamp',   'Lamps',     'lamp',   'common', '💡', '#7C3AED', 0,    0,       true, 2),
('Basic Rug',           'Rugs',      'rug',    'common', '🟫', '#4C1D95', 0,    0,       true, 3),
('Basic Wall Sign',     'Wall Items','wall',   'common', '🪧', '#8B5CF6', 0,    0,       true, 4)
ON CONFLICT DO NOTHING;

-- Chairs
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('DAWEN Neon Chair',    'Chairs', 'chair', 'uncommon', '🪑', '#8B5CF6', 0.01,  10000,  10),
('Purple Glass Chair',  'Chairs', 'chair', 'uncommon', '🪑', '#A78BFA', 0.01,  10000,  11),
('Cyber Throne',        'Chairs', 'chair', 'rare',     '🪑', '#7C3AED', 0.03,  30000,  12),
('Solana Lounge Chair', 'Chairs', 'chair', 'uncommon', '🪑', '#9333EA', 0.01,  10000,  13),
('Shadow Chair',        'Chairs', 'chair', 'common',   '🪑', '#1E1B4B', 0.005, 5000,   14)
ON CONFLICT DO NOTHING;

-- Tables
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('DAWEN Glass Table',   'Tables', 'table', 'uncommon', '🗃️', '#8B5CF6', 0.01,  10000,  20),
('Neon Trading Desk',   'Tables', 'table', 'rare',     '🗃️', '#7C3AED', 0.03,  30000,  21),
('Purple Coffee Table', 'Tables', 'table', 'common',   '🗃️', '#6D28D9', 0.005, 5000,   22),
('Solana Round Table',  'Tables', 'table', 'uncommon', '🗃️', '#5B21B6', 0.01,  10000,  23),
('Royal Desk',          'Tables', 'table', 'epic',     '🗃️', '#4C1D95', 0.05,  50000,  24)
ON CONFLICT DO NOTHING;

-- Sofas
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('Purple Velvet Sofa',  'Sofas', 'sofa', 'rare',      '🛋️', '#7C3AED', 0.03,  30000,  30),
('Cyber Lounge Sofa',   'Sofas', 'sofa', 'rare',      '🛋️', '#8B5CF6', 0.03,  30000,  31),
('DAWEN Crew Couch',    'Sofas', 'sofa', 'uncommon',  '🛋️', '#6D28D9', 0.01,  10000,  32),
('Neon Corner Sofa',    'Sofas', 'sofa', 'rare',      '🛋️', '#9333EA', 0.03,  30000,  33),
('VIP Royal Sofa',      'Sofas', 'sofa', 'legendary', '🛋️', '#A78BFA', 0.1,   100000, 34)
ON CONFLICT DO NOTHING;

-- Beds
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('Purple Sleep Pod',   'Beds', 'bed', 'rare',      '🛏️', '#7C3AED', 0.03,  30000,  40),
('DAWEN Royal Bed',    'Beds', 'bed', 'epic',      '🛏️', '#6D28D9', 0.05,  50000,  41),
('Cyber Capsule Bed',  'Beds', 'bed', 'rare',      '🛏️', '#8B5CF6', 0.03,  30000,  42),
('Neon Platform Bed',  'Beds', 'bed', 'rare',      '🛏️', '#9333EA', 0.03,  30000,  43)
ON CONFLICT DO NOTHING;

-- Lamps
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('Purple Neon Lamp',  'Lamps', 'lamp', 'common',   '💡', '#8B5CF6', 0.005, 5000,   50),
('Solana Glow Lamp',  'Lamps', 'lamp', 'uncommon', '💡', '#A78BFA', 0.01,  10000,  51),
('DAWEN Flame Lamp',  'Lamps', 'lamp', 'uncommon', '🔦', '#7C3AED', 0.01,  10000,  52),
('Hologram Lamp',     'Lamps', 'lamp', 'rare',     '🕯️', '#C4B5FD', 0.03,  30000,  53)
ON CONFLICT DO NOTHING;

-- Rugs
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('Purple Grid Rug',   'Rugs', 'rug', 'common',   '🟫', '#4C1D95', 0.005, 5000,   60),
('DAWEN Crown Rug',   'Rugs', 'rug', 'uncommon', '🟪', '#6D28D9', 0.01,  10000,  61),
('Solana Wave Rug',   'Rugs', 'rug', 'uncommon', '🔲', '#8B5CF6', 0.01,  10000,  62),
('Shadow Floor Rug',  'Rugs', 'rug', 'common',   '⬛', '#1E1B4B', 0.005, 5000,   63)
ON CONFLICT DO NOTHING;

-- Wall Items
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('DAWEN Neon Sign',        'Wall Items', 'wall', 'uncommon', '🪧', '#8B5CF6', 0.01,  10000,  70),
('Will of D Wall Symbol',  'Wall Items', 'wall', 'rare',     '🔮', '#7C3AED', 0.03,  30000,  71),
('Solana Wall Logo',       'Wall Items', 'wall', 'uncommon', '⚡', '#9333EA', 0.01,  10000,  72),
('Purple City Poster',     'Wall Items', 'wall', 'common',   '🖼️', '#6D28D9', 0.005, 5000,   73),
('Token Chart Wall Screen','Wall Items', 'wall', 'rare',     '📊', '#5B21B6', 0.03,  30000,  74)
ON CONFLICT DO NOTHING;

-- Plants
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('Purple Crystal Plant', 'Plants', 'plant', 'common',   '💎', '#8B5CF6', 0.005, 5000,   80),
('Cyber Palm',           'Plants', 'plant', 'uncommon', '🌴', '#7C3AED', 0.01,  10000,  81),
('Neon Bonsai',          'Plants', 'plant', 'uncommon', '🎋', '#A78BFA', 0.01,  10000,  82),
('Solana Flower Pot',    'Plants', 'plant', 'common',   '🌸', '#9333EA', 0.005, 5000,   83)
ON CONFLICT DO NOTHING;

-- Tech Items
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('Trading Monitor',   'Tech Items', 'tech', 'rare',      '🖥️', '#8B5CF6', 0.03,  30000,  90),
('Hologram Screen',   'Tech Items', 'tech', 'epic',      '📺', '#7C3AED', 0.05,  50000,  91),
('DAWEN Terminal',    'Tech Items', 'tech', 'rare',      '💻', '#6D28D9', 0.03,  30000,  92),
('Crypto Dashboard',  'Tech Items', 'tech', 'rare',      '📱', '#9333EA', 0.03,  30000,  93),
('Neon Server Rack',  'Tech Items', 'tech', 'epic',      '🗄️', '#5B21B6', 0.05,  50000,  94)
ON CONFLICT DO NOTHING;

-- Gaming Items
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('Arcade Machine',       'Gaming Items', 'gaming', 'rare',      '🕹️', '#8B5CF6', 0.03,  30000,  100),
('DAWEN Rush Cabinet',   'Gaming Items', 'gaming', 'epic',      '🎮', '#7C3AED', 0.05,  50000,  101),
('Game Console Table',   'Gaming Items', 'gaming', 'uncommon',  '🎯', '#A78BFA', 0.01,  10000,  102),
('Neon Scoreboard',      'Gaming Items', 'gaming', 'uncommon',  '🏆', '#9333EA', 0.01,  10000,  103),
('Arena Trophy Stand',   'Gaming Items', 'gaming', 'rare',      '🥇', '#6D28D9', 0.03,  30000,  104)
ON CONFLICT DO NOTHING;

-- Luxury Items
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('Royal Purple Throne',  'Luxury Items', 'luxury', 'legendary', '👑', '#7C3AED', 0.1,   100000, 110),
('Gold Crown Statue',    'Luxury Items', 'luxury', 'epic',      '🗿', '#8B5CF6', 0.05,  50000,  111),
('Diamond Wall Frame',   'Luxury Items', 'luxury', 'epic',      '💠', '#A78BFA', 0.05,  50000,  112),
('Luxury Fireplace',     'Luxury Items', 'luxury', 'legendary', '🔥', '#6D28D9', 0.1,   100000, 113),
('VIP Champagne Table',  'Luxury Items', 'luxury', 'epic',      '🍾', '#9333EA', 0.05,  50000,  114)
ON CONFLICT DO NOTHING;

-- DAWEN Specials
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('DAWEN Crown Statue',   'DAWEN Specials', 'special', 'epic',      '👑', '#8B5CF6', 0.05,  50000,  120),
('DAWEN Pulse Screen',   'DAWEN Specials', 'special', 'epic',      '📡', '#7C3AED', 0.05,  50000,  121),
('Dawen City Portal',    'DAWEN Specials', 'special', 'legendary', '🌀', '#6D28D9', 0.1,   100000, 122),
('Purple Flame Totem',   'DAWEN Specials', 'special', 'rare',      '🕯️', '#A78BFA', 0.03,  30000,  123),
('Dynasty Pillar',       'DAWEN Specials', 'special', 'epic',      '🏛️', '#9333EA', 0.05,  50000,  124)
ON CONFLICT DO NOTHING;

-- Solana Items
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, sort_order) VALUES
('Solana Portal',         'Solana Items', 'solana', 'rare',      '⚡', '#9333EA', 0.03,  30000,  130),
('SOL Coin Statue',       'Solana Items', 'solana', 'uncommon',  '🪙', '#8B5CF6', 0.01,  10000,  131),
('Validator Node Decor',  'Solana Items', 'solana', 'rare',      '🔗', '#7C3AED', 0.03,  30000,  132),
('Blockchain Hologram',   'Solana Items', 'solana', 'epic',      '🔮', '#6D28D9', 0.05,  50000,  133),
('Wallet Vault',          'Solana Items', 'solana', 'rare',      '🏦', '#5B21B6', 0.03,  30000,  134)
ON CONFLICT DO NOTHING;

-- VIP / Premium Items (premium_only)
INSERT INTO world_item_catalog (item_name, category, item_type, rarity, icon_emoji, color_hex, price_sol, price_dawen, is_premium_only, sort_order) VALUES
('Premium Aura Fountain', 'VIP / Premium', 'premium', 'legendary', '✨', '#A78BFA', 0.1,   100000, true, 140),
('Verified Gold Trophy',  'VIP / Premium', 'premium', 'legendary', '🏆', '#C4B5FD', 0.1,   100000, true, 141),
('Purple VIP Rope',       'VIP / Premium', 'premium', 'epic',      '🔴', '#8B5CF6', 0.05,  50000,  true, 142),
('Certified Lounge Door', 'VIP / Premium', 'premium', 'epic',      '🚪', '#7C3AED', 0.05,  50000,  true, 143),
('Premium Neon Halo',     'VIP / Premium', 'premium', 'legendary', '🌟', '#DDD6FE', 0.1,   100000, true, 144)
ON CONFLICT DO NOTHING;

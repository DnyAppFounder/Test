/*
  # DAWEN World Room Upgrades v2

  1. Changes to world_rooms
    - Add size_tier, room_width, room_height, max_players (idempotent)

  2. New Table: world_room_upgrades (with safe policy creation)
*/

-- Add size fields to world_rooms
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='world_rooms' AND column_name='size_tier') THEN
    ALTER TABLE world_rooms ADD COLUMN size_tier text NOT NULL DEFAULT 'standard' CHECK (size_tier IN ('standard','large','mega'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='world_rooms' AND column_name='room_width') THEN
    ALTER TABLE world_rooms ADD COLUMN room_width integer NOT NULL DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='world_rooms' AND column_name='room_height') THEN
    ALTER TABLE world_rooms ADD COLUMN room_height integer NOT NULL DEFAULT 8;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='world_rooms' AND column_name='max_players') THEN
    ALTER TABLE world_rooms ADD COLUMN max_players integer NOT NULL DEFAULT 20;
  END IF;
END $$;

-- world_room_upgrades
CREATE TABLE IF NOT EXISTS world_room_upgrades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       uuid NOT NULL REFERENCES world_rooms(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  tier          text NOT NULL CHECK (tier IN ('large','mega')),
  sol_paid      numeric(18,9) NOT NULL DEFAULT 0,
  tx_signature  text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE world_room_upgrades ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_room_upgrades' AND policyname='world_room_upgrades_select') THEN
    CREATE POLICY "world_room_upgrades_select"
      ON world_room_upgrades FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='world_room_upgrades' AND policyname='world_room_upgrades_insert') THEN
    CREATE POLICY "world_room_upgrades_insert"
      ON world_room_upgrades FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;
END $$;

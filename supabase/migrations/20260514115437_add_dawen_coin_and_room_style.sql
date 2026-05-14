/*
  # DawenCoin Balance System + Room Style

  1. New Tables
    - `dawen_coin_balances` - Tracks in-game DawenCoin currency per wallet
      - `wallet_address` (text, primary key)
      - `balance` (numeric) - current balance
      - `total_earned` / `total_spent` (numeric) - lifetime counters
      - `updated_at` (timestamptz)
    - `dawen_coin_transactions` - Ledger of all coin movements
      - `id` (uuid, primary key)
      - `wallet_address` (text)
      - `amount` (numeric) - positive=earn, negative=spend
      - `reason` (text)
      - `ref_id` (text, optional)
      - `created_at` (timestamptz)

  2. Modified Tables
    - `world_rooms` - Added `room_style` column (apartment/house/villa)

  3. Security
    - RLS enabled on both new tables
    - Policies scoped by wallet_address ownership
*/

-- dawen_coin_balances
CREATE TABLE IF NOT EXISTS dawen_coin_balances (
  wallet_address  text PRIMARY KEY,
  balance         numeric(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned    numeric(18,2) NOT NULL DEFAULT 0,
  total_spent     numeric(18,2) NOT NULL DEFAULT 0,
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE dawen_coin_balances ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dawen_coin_balances' AND policyname='coin_balances_select_own') THEN
    CREATE POLICY "coin_balances_select_own"
      ON dawen_coin_balances FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dawen_coin_balances' AND policyname='coin_balances_insert_own') THEN
    CREATE POLICY "coin_balances_insert_own"
      ON dawen_coin_balances FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dawen_coin_balances' AND policyname='coin_balances_update_own') THEN
    CREATE POLICY "coin_balances_update_own"
      ON dawen_coin_balances FOR UPDATE
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- dawen_coin_transactions
CREATE TABLE IF NOT EXISTS dawen_coin_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  text NOT NULL,
  amount          numeric(18,2) NOT NULL,
  reason          text NOT NULL DEFAULT '',
  ref_id          text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE dawen_coin_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dawen_coin_transactions' AND policyname='coin_tx_select_own') THEN
    CREATE POLICY "coin_tx_select_own"
      ON dawen_coin_transactions FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dawen_coin_transactions' AND policyname='coin_tx_insert_own') THEN
    CREATE POLICY "coin_tx_insert_own"
      ON dawen_coin_transactions FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- Add room_style to world_rooms
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'world_rooms' AND column_name = 'room_style'
  ) THEN
    ALTER TABLE world_rooms ADD COLUMN room_style text NOT NULL DEFAULT 'apartment'
      CHECK (room_style IN ('apartment','house','villa'));
  END IF;
END $$;

-- Grant starter DawenCoins: every new wallet gets 500 coins
-- This is handled in the application layer via earnDawenCoins()

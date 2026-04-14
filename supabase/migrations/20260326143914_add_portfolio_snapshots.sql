/*
  # Add Portfolio Snapshots Table

  1. New Tables
    - `portfolio_snapshots`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `wallet_address` (text)
      - `total_value` (numeric) - Portfolio value in USD
      - `snapshot_date` (timestamptz) - When the snapshot was taken
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `portfolio_snapshots` table
    - Add policies for authenticated users to:
      - Insert their own snapshots
      - Read their own snapshots
      - Delete their own old snapshots

  3. Indexes
    - Add index on wallet_address for faster queries
    - Add index on snapshot_date for time-based queries
*/

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  total_value numeric NOT NULL DEFAULT 0,
  snapshot_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own snapshots"
  ON portfolio_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view own snapshots"
  ON portfolio_snapshots
  FOR SELECT
  TO authenticated
  USING (wallet_address = (SELECT wallet_address FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete own snapshots"
  ON portfolio_snapshots
  FOR DELETE
  TO authenticated
  USING (wallet_address = (SELECT wallet_address FROM user_profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_wallet 
  ON portfolio_snapshots(wallet_address);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_date 
  ON portfolio_snapshots(snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date 
  ON portfolio_snapshots(user_id, snapshot_date DESC);

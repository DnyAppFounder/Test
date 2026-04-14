/*
  # Price Alerts System

  1. New Tables
    - `price_alerts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `token_id` (text) - CoinGecko ID
      - `token_symbol` (text)
      - `token_name` (text)
      - `alert_type` (text) - 'above' | 'below'
      - `target_price` (numeric)
      - `is_active` (boolean)
      - `triggered` (boolean)
      - `triggered_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Users can manage their own alerts
*/

-- Create price_alerts table
CREATE TABLE IF NOT EXISTS price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  token_id text NOT NULL,
  token_symbol text NOT NULL,
  token_name text NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('above', 'below')),
  target_price numeric NOT NULL CHECK (target_price > 0),
  is_active boolean DEFAULT true,
  triggered boolean DEFAULT false,
  triggered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_token_id ON price_alerts(token_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can read own alerts"
  ON price_alerts FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM user_profiles WHERE id = price_alerts.user_id));

CREATE POLICY "Users can create own alerts"
  ON price_alerts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM user_profiles WHERE id = price_alerts.user_id));

CREATE POLICY "Users can update own alerts"
  ON price_alerts FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM user_profiles WHERE id = price_alerts.user_id))
  WITH CHECK (auth.uid() IN (SELECT id FROM user_profiles WHERE id = price_alerts.user_id));

CREATE POLICY "Users can delete own alerts"
  ON price_alerts FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM user_profiles WHERE id = price_alerts.user_id));

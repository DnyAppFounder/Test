/*
  # User Assets & Transaction Tracking

  ## New Tables
  
  ### `user_assets`
  Tracks user-owned cryptocurrency assets with quantities and cost basis.
  - `id` (uuid, primary key)
  - `user_id` (uuid, references user_profiles) - Asset owner
  - `token_id` (uuid, references tokens) - Which token
  - `quantity` (numeric) - Amount owned
  - `avg_buy_price` (numeric) - Average purchase price for P&L
  - `last_updated` (timestamptz) - Last balance update
  - `created_at` (timestamptz) - First purchase date
  
  ### `user_transactions`
  Complete transaction history for all user crypto activities.
  - `id` (uuid, primary key)
  - `user_id` (uuid, references user_profiles) - Transaction owner
  - `token_id` (uuid, references tokens) - Which token
  - `transaction_type` (text) - 'buy', 'sell', 'send', 'receive', 'swap'
  - `quantity` (numeric) - Amount transacted
  - `price_per_token` (numeric) - Price at transaction time
  - `total_value` (numeric) - Total USD value
  - `fee` (numeric) - Transaction fee
  - `from_address` (text) - Sender (for receive/send)
  - `to_address` (text) - Recipient (for send)
  - `tx_hash` (text) - Blockchain transaction hash
  - `status` (text) - 'pending', 'completed', 'failed'
  - `notes` (text) - Optional notes
  - `created_at` (timestamptz) - Transaction timestamp

  ### `user_watchlist`
  Tokens the user is tracking/favorited.
  - `id` (uuid, primary key)
  - `user_id` (uuid, references user_profiles)
  - `token_id` (uuid, references tokens)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Users can only access their own assets/transactions/watchlist
  - Indexes for performance on user_id lookups

  ## Important Notes
  - user_assets.quantity updates after each transaction
  - avg_buy_price recalculates using weighted average on buys
  - Transactions are immutable once completed
  - Failed transactions kept for history
*/

-- User Assets Table
CREATE TABLE IF NOT EXISTS user_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  avg_buy_price numeric NOT NULL DEFAULT 0 CHECK (avg_buy_price >= 0),
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, token_id)
);

-- User Transactions Table
CREATE TABLE IF NOT EXISTS user_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('buy', 'sell', 'send', 'receive', 'swap')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  price_per_token numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  fee numeric DEFAULT 0,
  from_address text,
  to_address text,
  tx_hash text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- User Watchlist Table
CREATE TABLE IF NOT EXISTS user_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, token_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON user_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_token_id ON user_assets(token_id);
CREATE INDEX IF NOT EXISTS idx_user_transactions_user_id ON user_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_transactions_token_id ON user_transactions(token_id);
CREATE INDEX IF NOT EXISTS idx_user_transactions_created_at ON user_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_id ON user_watchlist(user_id);

-- Enable RLS
ALTER TABLE user_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_assets
CREATE POLICY "Users can view own assets"
  ON user_assets FOR SELECT
  TO authenticated
  USING (user_id = (SELECT id FROM user_profiles WHERE wallet_address = auth.jwt()->>'wallet_address'));

CREATE POLICY "Users can insert own assets"
  ON user_assets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT id FROM user_profiles WHERE wallet_address = auth.jwt()->>'wallet_address'));

CREATE POLICY "Users can update own assets"
  ON user_assets FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT id FROM user_profiles WHERE wallet_address = auth.jwt()->>'wallet_address'))
  WITH CHECK (user_id = (SELECT id FROM user_profiles WHERE wallet_address = auth.jwt()->>'wallet_address'));

CREATE POLICY "Users can delete own assets"
  ON user_assets FOR DELETE
  TO authenticated
  USING (user_id = (SELECT id FROM user_profiles WHERE wallet_address = auth.jwt()->>'wallet_address'));

-- RLS Policies for user_transactions
CREATE POLICY "Users can view own transactions"
  ON user_transactions FOR SELECT
  TO authenticated
  USING (user_id = (SELECT id FROM user_profiles WHERE wallet_address = auth.jwt()->>'wallet_address'));

CREATE POLICY "Users can insert own transactions"
  ON user_transactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT id FROM user_profiles WHERE wallet_address = auth.jwt()->>'wallet_address'));

-- RLS Policies for user_watchlist
CREATE POLICY "Users can view own watchlist"
  ON user_watchlist FOR SELECT
  TO authenticated
  USING (user_id = (SELECT id FROM user_profiles WHERE wallet_address = auth.jwt()->>'wallet_address'));

CREATE POLICY "Users can insert to own watchlist"
  ON user_watchlist FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT id FROM user_profiles WHERE wallet_address = auth.jwt()->>'wallet_address'));

CREATE POLICY "Users can delete from own watchlist"
  ON user_watchlist FOR DELETE
  TO authenticated
  USING (user_id = (SELECT id FROM user_profiles WHERE wallet_address = auth.jwt()->>'wallet_address'));

-- Function to update user_assets after transaction
CREATE OR REPLACE FUNCTION update_user_assets_after_transaction()
RETURNS TRIGGER AS $$
DECLARE
  current_quantity numeric;
  current_avg_price numeric;
  new_avg_price numeric;
BEGIN
  -- Only process completed buy/sell transactions
  IF NEW.status = 'completed' AND (NEW.transaction_type = 'buy' OR NEW.transaction_type = 'sell') THEN
    
    -- Get current asset data
    SELECT quantity, avg_buy_price INTO current_quantity, current_avg_price
    FROM user_assets
    WHERE user_id = NEW.user_id AND token_id = NEW.token_id;
    
    IF NEW.transaction_type = 'buy' THEN
      -- Calculate new weighted average price
      IF current_quantity IS NULL THEN
        current_quantity := 0;
        current_avg_price := 0;
      END IF;
      
      new_avg_price := ((current_quantity * current_avg_price) + (NEW.quantity * NEW.price_per_token)) / 
                       (current_quantity + NEW.quantity);
      
      -- Insert or update user_assets
      INSERT INTO user_assets (user_id, token_id, quantity, avg_buy_price, last_updated)
      VALUES (NEW.user_id, NEW.token_id, NEW.quantity, NEW.price_per_token, now())
      ON CONFLICT (user_id, token_id)
      DO UPDATE SET
        quantity = user_assets.quantity + NEW.quantity,
        avg_buy_price = new_avg_price,
        last_updated = now();
        
    ELSIF NEW.transaction_type = 'sell' THEN
      -- Decrease quantity
      UPDATE user_assets
      SET quantity = quantity - NEW.quantity,
          last_updated = now()
      WHERE user_id = NEW.user_id AND token_id = NEW.token_id;
      
      -- Delete if quantity reaches zero
      DELETE FROM user_assets
      WHERE user_id = NEW.user_id AND token_id = NEW.token_id AND quantity <= 0;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update user_assets
CREATE TRIGGER trigger_update_user_assets
  AFTER INSERT OR UPDATE ON user_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_assets_after_transaction();

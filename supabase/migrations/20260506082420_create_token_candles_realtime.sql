/*
  # Token candles table for real-time chart data

  ## Purpose
  Stores OHLCV candles built from live Helius WebSocket trade events,
  and historical candles fetched from GeckoTerminal. The chart reads
  from this table and subscribes to Supabase Realtime for live updates.

  ## New Tables
  - `token_candles`
    - `id`           (bigserial, primary key)
    - `token_mint`   (text) — Solana token mint address (base token)
    - `timeframe`    (text) — candle interval: '1m','5m','15m','1H','4H','1D'
    - `open_time`    (bigint) — candle open Unix timestamp in milliseconds
    - `open`         (numeric) — open price in USD
    - `high`         (numeric) — high price in USD
    - `low`          (numeric) — low price in USD
    - `close`        (numeric) — close price in USD
    - `volume`       (numeric) — volume in USD
    - `is_live`      (boolean) — true while candle is still open (current candle)
    - `updated_at`   (timestamptz)

  ## Indexes
  - Composite index on (token_mint, timeframe, open_time DESC) for fast range queries
  - Unique constraint on (token_mint, timeframe, open_time)

  ## Security
  - RLS enabled
  - Public read (chart data is not sensitive)
  - Service role writes (edge function writes candles)
*/

CREATE TABLE IF NOT EXISTS token_candles (
  id          bigserial PRIMARY KEY,
  token_mint  text        NOT NULL,
  timeframe   text        NOT NULL,
  open_time   bigint      NOT NULL,
  open        numeric     NOT NULL DEFAULT 0,
  high        numeric     NOT NULL DEFAULT 0,
  low         numeric     NOT NULL DEFAULT 0,
  close       numeric     NOT NULL DEFAULT 0,
  volume      numeric     NOT NULL DEFAULT 0,
  is_live     boolean     NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT token_candles_unique UNIQUE (token_mint, timeframe, open_time)
);

CREATE INDEX IF NOT EXISTS token_candles_lookup
  ON token_candles (token_mint, timeframe, open_time DESC);

ALTER TABLE token_candles ENABLE ROW LEVEL SECURITY;

-- Anyone can read candles (chart is public)
CREATE POLICY "Anyone can read token candles"
  ON token_candles
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service role can insert/update candles (edge function)
CREATE POLICY "Service role can insert candles"
  ON token_candles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update candles"
  ON token_candles
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

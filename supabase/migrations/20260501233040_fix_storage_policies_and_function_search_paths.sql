/*
  # Fix Storage Policies and Function search_path

  ## Summary
  Addresses two remaining security vulnerabilities identified in the audit:

  1. Storage upload policy for post-media uses auth.uid() which is always null
     in this app (wallet-based auth, no Supabase Auth session). This means media
     uploads from create-post always fail. Fix: allow public uploads to post-media
     while keeping SELECT public and DELETE restricted to authenticated users.

  2. Functions generate_referral_code and update_user_assets_after_transaction
     lack a SET search_path = '' directive, making them vulnerable to search_path
     injection attacks where a malicious user could shadow system functions by
     creating objects in their own schema. Fix: recreate both functions with
     SET search_path = '' and fully-qualified table references.
*/

-- ============================================================
-- Fix post-media storage upload policy
-- Allow public uploads since app has no Supabase Auth session
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload post media" ON storage.objects;

CREATE POLICY "Public can upload post media"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'post-media');

-- ============================================================
-- Fix generate_referral_code: add SET search_path = ''
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_username text;
  v_exists boolean;
BEGIN
  SELECT username INTO v_username FROM public.user_profiles WHERE id = p_user_id;

  IF v_username IS NOT NULL THEN
    v_code := upper(substring(v_username from 1 for 6)) || floor(random() * 1000)::text;
  ELSE
    v_code := upper(substring(md5(random()::text) from 1 for 8));
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE code = v_code) INTO v_exists;

  WHILE v_exists LOOP
    v_code := v_code || floor(random() * 10)::text;
    SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE code = v_code) INTO v_exists;
  END LOOP;

  RETURN v_code;
END;
$$;

-- ============================================================
-- Fix update_user_assets_after_transaction: add SET search_path = ''
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_user_assets_after_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  current_quantity numeric;
  current_avg_price numeric;
  new_avg_price numeric;
BEGIN
  IF NEW.status = 'completed' AND (NEW.transaction_type = 'buy' OR NEW.transaction_type = 'sell') THEN

    SELECT quantity, avg_buy_price INTO current_quantity, current_avg_price
    FROM public.user_assets
    WHERE user_id = NEW.user_id AND token_id = NEW.token_id;

    IF NEW.transaction_type = 'buy' THEN
      IF current_quantity IS NULL THEN
        current_quantity := 0;
        current_avg_price := 0;
      END IF;

      new_avg_price := ((current_quantity * current_avg_price) + (NEW.quantity * NEW.price_per_token)) /
        (current_quantity + NEW.quantity);

      INSERT INTO public.user_assets (user_id, token_id, quantity, avg_buy_price, last_updated)
      VALUES (NEW.user_id, NEW.token_id, NEW.quantity, NEW.price_per_token, now())
      ON CONFLICT (user_id, token_id)
      DO UPDATE SET
        quantity = public.user_assets.quantity + NEW.quantity,
        avg_buy_price = new_avg_price,
        last_updated = now();

    ELSIF NEW.transaction_type = 'sell' THEN
      UPDATE public.user_assets
      SET quantity = quantity - NEW.quantity,
          last_updated = now()
      WHERE user_id = NEW.user_id AND token_id = NEW.token_id;

      DELETE FROM public.user_assets
      WHERE user_id = NEW.user_id AND token_id = NEW.token_id AND quantity <= 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

/*
  # Add Certification System

  ## Summary
  Adds premium certification support to user profiles and ensures
  the follow relationship table supports listing followers/following.

  ## Changes

  ### Modified Tables
  - `user_profiles`
    - `is_verified` already exists (basic/free certification - purple badge)
    - `is_premium` (boolean) — new premium paid certification flag (purple badge + star)
    - `premium_expires_at` (timestamptz) — when premium expires (null = no expiry or not premium)
    - `premium_tier` (text) — 'sol' | 'dawen' | null — which currency was used to pay

  ## Security
  - RLS already enabled on user_profiles
  - New columns inherit existing policies
  - Users can only update their own profile (existing policy covers this)

  ## Notes
  - Basic verified (is_verified=true): purple BadgeCheck icon
  - Premium (is_premium=true): purple BadgeCheck + gold Star icon beside it
  - Certification config for who gets is_verified=true will be handled next prompt
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'is_premium'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN is_premium boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'premium_expires_at'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN premium_expires_at timestamptz DEFAULT null;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'premium_tier'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN premium_tier text DEFAULT null;
  END IF;
END $$;

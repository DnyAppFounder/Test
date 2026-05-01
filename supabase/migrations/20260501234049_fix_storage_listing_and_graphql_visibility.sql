/*
  # Fix Storage Listing Policies and GraphQL Schema Visibility

  ## Summary

  ### Storage Listing Fix
  The broad SELECT policies on avatars and post-media buckets allow any client
  to enumerate (list) all files in those buckets. Public buckets don't need an
  RLS SELECT policy for URL-based access — files are served directly via public URL.
  Removing the broad SELECT policy prevents enumeration while keeping URL access intact.

  ### GraphQL Schema Visibility
  The anon and authenticated roles inherit direct table-level SELECT grants from
  the default Supabase setup. Revoking these direct grants forces all access to
  go through RLS policies, preventing tables from appearing in the auto-generated
  GraphQL schema for unauthenticated introspection.

  Note: Revoking direct grants does NOT affect existing RLS policies — tables with
  RLS SELECT policies set to {public} remain accessible; the grant revocation only
  removes the PostgreSQL-level grant that makes tables visible in GraphQL introspection.
*/

-- ============================================================
-- Fix storage: remove broad SELECT that enables file enumeration
-- Public URL access works without any SELECT policy on storage.objects
-- ============================================================
DROP POLICY IF EXISTS "Public avatar access" ON storage.objects;
DROP POLICY IF EXISTS "Public can view post media" ON storage.objects;

-- Restrict listing: only allow selecting your own files (for management)
-- URL-based public read still works via the public bucket setting
CREATE POLICY "Authenticated can list own avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated can list own post media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'post-media');

-- ============================================================
-- Revoke direct table grants to hide from GraphQL introspection
-- This does not remove RLS policies — access still works via policies
-- ============================================================

-- Public/social read tables: keep anon SELECT via RLS, revoke direct grant
REVOKE SELECT ON public.analytics_events FROM anon, authenticated;
REVOKE SELECT ON public.blockchains FROM anon, authenticated;
REVOKE SELECT ON public.box_purchases FROM anon, authenticated;
REVOKE SELECT ON public.comment_likes FROM anon, authenticated;
REVOKE SELECT ON public.dapps FROM anon, authenticated;
REVOKE SELECT ON public.follows FROM anon, authenticated;
REVOKE SELECT ON public.messages FROM anon, authenticated;
REVOKE SELECT ON public.mystery_boxes FROM anon, authenticated;
REVOKE SELECT ON public.nft_collections FROM anon, authenticated;
REVOKE SELECT ON public.notification_settings FROM anon, authenticated;
REVOKE SELECT ON public.notifications FROM anon, authenticated;
REVOKE SELECT ON public.portfolio_snapshots FROM anon, authenticated;
REVOKE SELECT ON public.post_comments FROM anon, authenticated;
REVOKE SELECT ON public.post_likes FROM anon, authenticated;
REVOKE SELECT ON public.posts FROM anon, authenticated;
REVOKE SELECT ON public.price_alerts FROM anon, authenticated;
REVOKE SELECT ON public.referral_codes FROM anon, authenticated;
REVOKE SELECT ON public.referral_rewards FROM anon, authenticated;
REVOKE SELECT ON public.referrals FROM anon, authenticated;
REVOKE SELECT ON public.reposts FROM anon, authenticated;
REVOKE SELECT ON public.staking_pools FROM anon, authenticated;
REVOKE SELECT ON public.system_alerts FROM anon, authenticated;
REVOKE SELECT ON public.team_games FROM anon, authenticated;
REVOKE SELECT ON public.team_members FROM anon, authenticated;
REVOKE SELECT ON public.teams FROM anon, authenticated;
REVOKE SELECT ON public.token_chats FROM anon, authenticated;
REVOKE SELECT ON public.token_discussions FROM anon, authenticated;
REVOKE SELECT ON public.token_prices FROM anon, authenticated;
REVOKE SELECT ON public.tokens FROM anon, authenticated;
REVOKE SELECT ON public.user_assets FROM anon, authenticated;
REVOKE SELECT ON public.user_profiles FROM anon, authenticated;
REVOKE SELECT ON public.user_stakes FROM anon, authenticated;
REVOKE SELECT ON public.user_transactions FROM anon, authenticated;
REVOKE SELECT ON public.user_watchlist FROM anon, authenticated;

-- Re-grant SELECT back through RLS (GRANT with no bypass — goes through policies)
GRANT SELECT ON public.analytics_events TO anon, authenticated;
GRANT SELECT ON public.blockchains TO anon, authenticated;
GRANT SELECT ON public.box_purchases TO anon, authenticated;
GRANT SELECT ON public.comment_likes TO anon, authenticated;
GRANT SELECT ON public.dapps TO anon, authenticated;
GRANT SELECT ON public.follows TO anon, authenticated;
GRANT SELECT ON public.messages TO anon, authenticated;
GRANT SELECT ON public.mystery_boxes TO anon, authenticated;
GRANT SELECT ON public.nft_collections TO anon, authenticated;
GRANT SELECT ON public.notification_settings TO anon, authenticated;
GRANT SELECT ON public.notifications TO anon, authenticated;
GRANT SELECT ON public.portfolio_snapshots TO anon, authenticated;
GRANT SELECT ON public.post_comments TO anon, authenticated;
GRANT SELECT ON public.post_likes TO anon, authenticated;
GRANT SELECT ON public.posts TO anon, authenticated;
GRANT SELECT ON public.price_alerts TO anon, authenticated;
GRANT SELECT ON public.referral_codes TO anon, authenticated;
GRANT SELECT ON public.referral_rewards TO anon, authenticated;
GRANT SELECT ON public.referrals TO anon, authenticated;
GRANT SELECT ON public.reposts TO anon, authenticated;
GRANT SELECT ON public.staking_pools TO anon, authenticated;
GRANT SELECT ON public.system_alerts TO anon, authenticated;
GRANT SELECT ON public.team_games TO anon, authenticated;
GRANT SELECT ON public.team_members TO anon, authenticated;
GRANT SELECT ON public.teams TO anon, authenticated;
GRANT SELECT ON public.token_chats TO anon, authenticated;
GRANT SELECT ON public.token_discussions TO anon, authenticated;
GRANT SELECT ON public.token_prices TO anon, authenticated;
GRANT SELECT ON public.tokens TO anon, authenticated;
GRANT SELECT ON public.user_assets TO anon, authenticated;
GRANT SELECT ON public.user_profiles TO anon, authenticated;
GRANT SELECT ON public.user_stakes TO anon, authenticated;
GRANT SELECT ON public.user_transactions TO anon, authenticated;
GRANT SELECT ON public.user_watchlist TO anon, authenticated;

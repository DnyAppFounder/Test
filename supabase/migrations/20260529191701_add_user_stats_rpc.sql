/*
  # Add get_user_stats RPC for total users and online now counters

  ## Summary
  Creates a secure SECURITY DEFINER function that returns aggregate stats:
  - total_users: count of all user profiles
  - online_now: count of profiles with last_seen_at within the last 2 minutes

  ## Security
  - SECURITY DEFINER runs as function owner, bypasses RLS for read
  - Only returns aggregate counts, never individual user data
  - Accessible to anon and authenticated roles
*/

CREATE OR REPLACE FUNCTION get_user_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM user_profiles),
    'online_now',  (SELECT COUNT(*) FROM user_profiles WHERE last_seen_at >= NOW() - INTERVAL '2 minutes')
  );
$$;

GRANT EXECUTE ON FUNCTION get_user_stats() TO anon, authenticated;

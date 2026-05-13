/*
  # Enable Supabase Realtime for all live-feature tables

  ## Summary
  Only `launchpad_presales` and `launchpad_presale_contributions` were in the
  supabase_realtime publication. This migration adds every table that drives
  live UI updates in the app.

  ## Tables added to publication
  - posts / post_likes / post_comments / reposts / comment_likes — social feed
  - notifications — in-app alert banner and badge counter
  - messages — direct messages / DM threads
  - user_profiles / follows — profile + follow-state changes
  - duel_entries / duel_matches — game matchmaking sync
  - world_messages / world_presence / world_room_items / world_rooms — Dawen World
  - world_room_upgrades / world_inventory — World room state
  - token_discussions / token_chats — token page chat
  - token_candles — chart live candle updates

  ## REPLICA IDENTITY changes
  Tables that need full-row data in DELETE events (so client can identify
  which post/repost was removed to decrement counters):
  - post_likes → FULL
  - reposts    → FULL
  - comment_likes → FULL
  - follows    → FULL

  ## Security
  Existing RLS policies remain untouched. Publication membership only
  controls *which* changes are streamed; row-level security still governs
  *who* can receive each row.
*/

DO $$
DECLARE
  tables_to_add TEXT[] := ARRAY[
    'posts',
    'post_likes',
    'post_comments',
    'reposts',
    'comment_likes',
    'notifications',
    'messages',
    'user_profiles',
    'follows',
    'duel_entries',
    'duel_matches',
    'world_messages',
    'world_presence',
    'world_room_items',
    'world_rooms',
    'world_room_upgrades',
    'world_inventory',
    'token_discussions',
    'token_chats',
    'token_candles'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_to_add LOOP
    -- Skip if table does not exist (avoids error on optional tables)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Table % does not exist, skipping', t;
      CONTINUE;
    END IF;
    -- Skip if already in publication
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      RAISE NOTICE 'Table % already in publication, skipping', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    RAISE NOTICE 'Added % to supabase_realtime publication', t;
  END LOOP;
END $$;

-- REPLICA IDENTITY FULL for tables where DELETE events must carry post_id / user_id
-- so the client can decrement like/repost counters on unlike/un-repost
ALTER TABLE post_likes    REPLICA IDENTITY FULL;
ALTER TABLE reposts       REPLICA IDENTITY FULL;
ALTER TABLE comment_likes REPLICA IDENTITY FULL;
ALTER TABLE follows       REPLICA IDENTITY FULL;

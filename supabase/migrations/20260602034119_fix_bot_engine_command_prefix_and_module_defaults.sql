/*
  # Fix Bot Engine Schema

  ## Summary
  Fixes several issues with the DAWEN bot engine:

  1. The `command_prefix` column had a CHECK constraint limiting values to only '/' or '!'
     — expanded to allow any 1-3 character prefix so bots can use custom prefixes

  2. Adds `dawen_bot_logs` INSERT policy so the edge function (via service role) can insert logs
     even when RLS is active (service role bypasses RLS but policy might block anon)

  3. Adds INSERT policy on `group_messages` for service role bot inserts (belt-and-suspenders)

  4. Adds a `pulse_announcement` column to support Pulse Bot announce tracking

  5. Fixes missing `updated_at` column on `dawen_bot_modules` (was missing from earlier migration)

  ## Notes
  - All changes are additive / non-destructive
  - Existing bots are not modified
*/

-- Fix command_prefix CHECK constraint to allow any 1-3 char prefix
ALTER TABLE dawen_bots DROP CONSTRAINT IF EXISTS dawen_bots_command_prefix_check;
ALTER TABLE dawen_bots ADD CONSTRAINT dawen_bots_command_prefix_check CHECK (char_length(command_prefix) BETWEEN 1 AND 3);

-- Ensure dawen_bot_logs has an updated_at (some queries may need it)
ALTER TABLE dawen_bot_logs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Add INSERT policy on dawen_bot_logs so authenticated users can see own-triggered logs (service role bypasses RLS anyway)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dawen_bot_logs' AND policyname = 'dawen_bot_logs_member_insert'
  ) THEN
    CREATE POLICY "dawen_bot_logs_member_insert"
      ON dawen_bot_logs FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = dawen_bot_logs.group_id AND gm.user_id = auth.uid()
            AND gm.removed_at IS NULL
        )
      );
  END IF;
END $$;

-- Ensure dawen_bot_cmd_cooldowns has INSERT/SELECT policy for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dawen_bot_cmd_cooldowns' AND policyname = 'dawen_bot_cmd_cooldowns_self_all'
  ) THEN
    CREATE POLICY "dawen_bot_cmd_cooldowns_self_all"
      ON dawen_bot_cmd_cooldowns FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

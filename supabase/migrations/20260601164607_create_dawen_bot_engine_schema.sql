/*
  # DAWEN Bot Engine — Full Schema
  
  Creates the complete bot engine for DAWEN group bots.
  Uses "dawen_" prefix to avoid conflicts with existing tables.
  
  New tables:
  - dawen_bots: bot instances per group (multiple, typed by module)
  - dawen_bot_modules: per-bot module config (guard, sentinel, welcome, etc.)
  - dawen_bot_cmds: commands per bot (custom + built-in)
  - dawen_bot_cmd_cooldowns: per-user cooldown tracking
  - dawen_bot_logs: audit log of bot actions
  - dawen_moderation_filters: anti-spam, anti-link, flood protection config
  - dawen_moderation_cases: warn/mute/ban/kick records
  - dawen_captcha_sessions: pending verification state
  - dawen_member_permissions: extended bot permissions per member
  - raid_tasks: X/Twitter raid missions
  - raid_participants: user participation in raids
  - x_account_links: linked X/Twitter accounts (OAuth metadata only)
*/

-- ─── dawen_bots ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dawen_bots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  bot_type       text NOT NULL DEFAULT 'core'
                 CHECK (bot_type IN ('core','guard','sentinel','welcome','pulse','oracle','raid','reward')),
  bot_name       text NOT NULL DEFAULT 'DAWEN Bot',
  bot_avatar_url text,
  command_prefix text NOT NULL DEFAULT '/'
                 CHECK (command_prefix IN ('/','!')),
  is_enabled     boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, bot_type)
);

ALTER TABLE dawen_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dawen_bots_admin_all"
  ON dawen_bots FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_bots.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_bots.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  );

CREATE POLICY "dawen_bots_member_select"
  ON dawen_bots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_bots.group_id AND gm.user_id = auth.uid()
        AND gm.removed_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_dawen_bots_group_id ON dawen_bots(group_id);

-- ─── dawen_bot_modules ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dawen_bot_modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      uuid NOT NULL REFERENCES dawen_bots(id) ON DELETE CASCADE,
  module_name text NOT NULL
              CHECK (module_name IN ('guard','sentinel','welcome','pulse','oracle','raid','reward')),
  is_enabled  boolean NOT NULL DEFAULT true,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, module_name)
);

ALTER TABLE dawen_bot_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dawen_bot_modules_admin_all"
  ON dawen_bot_modules FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dawen_bots db
      JOIN group_members gm ON gm.group_id = db.group_id
      WHERE db.id = dawen_bot_modules.bot_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dawen_bots db
      JOIN group_members gm ON gm.group_id = db.group_id
      WHERE db.id = dawen_bot_modules.bot_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  );

CREATE POLICY "dawen_bot_modules_member_select"
  ON dawen_bot_modules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dawen_bots db
      JOIN group_members gm ON gm.group_id = db.group_id
      WHERE db.id = dawen_bot_modules.bot_id AND gm.user_id = auth.uid()
        AND gm.removed_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_dawen_bot_modules_bot_id ON dawen_bot_modules(bot_id);

-- ─── dawen_bot_cmds ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dawen_bot_cmds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id           uuid NOT NULL REFERENCES dawen_bots(id) ON DELETE CASCADE,
  command          text NOT NULL,
  description      text NOT NULL DEFAULT '',
  response_text    text NOT NULL DEFAULT '',
  response_card    jsonb,
  is_builtin       boolean NOT NULL DEFAULT false,
  is_enabled       boolean NOT NULL DEFAULT true,
  allowed_roles    text[] NOT NULL DEFAULT ARRAY[]::text[],
  cooldown_seconds int NOT NULL DEFAULT 0,
  module_name      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, command)
);

ALTER TABLE dawen_bot_cmds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dawen_bot_cmds_admin_all"
  ON dawen_bot_cmds FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dawen_bots db
      JOIN group_members gm ON gm.group_id = db.group_id
      WHERE db.id = dawen_bot_cmds.bot_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dawen_bots db
      JOIN group_members gm ON gm.group_id = db.group_id
      WHERE db.id = dawen_bot_cmds.bot_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  );

CREATE POLICY "dawen_bot_cmds_member_select"
  ON dawen_bot_cmds FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dawen_bots db
      JOIN group_members gm ON gm.group_id = db.group_id
      WHERE db.id = dawen_bot_cmds.bot_id AND gm.user_id = auth.uid()
        AND gm.removed_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_dawen_bot_cmds_bot_id ON dawen_bot_cmds(bot_id);

-- ─── dawen_bot_cmd_cooldowns ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dawen_bot_cmd_cooldowns (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cmd_id     uuid NOT NULL REFERENCES dawen_bot_cmds(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  last_used  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cmd_id, user_id)
);

ALTER TABLE dawen_bot_cmd_cooldowns ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_dawen_bot_cmd_cooldowns ON dawen_bot_cmd_cooldowns(cmd_id, user_id);

-- ─── dawen_bot_logs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dawen_bot_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      uuid NOT NULL REFERENCES dawen_bots(id) ON DELETE CASCADE,
  group_id    uuid NOT NULL,
  action_type text NOT NULL,
  actor_id    uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  target_id   uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  command     text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dawen_bot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dawen_bot_logs_admin_select"
  ON dawen_bot_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_bot_logs.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin','moderator') AND gm.removed_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_dawen_bot_logs_group_id ON dawen_bot_logs(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dawen_bot_logs_bot_id ON dawen_bot_logs(bot_id);

-- ─── dawen_moderation_filters ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dawen_moderation_filters (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  banned_words          text[] NOT NULL DEFAULT ARRAY[]::text[],
  anti_link_enabled     boolean NOT NULL DEFAULT false,
  anti_link_allowlist   text[] NOT NULL DEFAULT ARRAY[]::text[],
  anti_flood_enabled    boolean NOT NULL DEFAULT false,
  anti_flood_max_msgs   int NOT NULL DEFAULT 5,
  anti_flood_window_sec int NOT NULL DEFAULT 10,
  anti_spam_enabled     boolean NOT NULL DEFAULT false,
  captcha_enabled       boolean NOT NULL DEFAULT false,
  captcha_timeout_sec   int NOT NULL DEFAULT 120,
  auto_mute_threshold   int NOT NULL DEFAULT 3,
  auto_kick_threshold   int NOT NULL DEFAULT 5,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id)
);

ALTER TABLE dawen_moderation_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dawen_moderation_filters_admin_all"
  ON dawen_moderation_filters FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_moderation_filters.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_moderation_filters.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  );

CREATE POLICY "dawen_moderation_filters_mod_select"
  ON dawen_moderation_filters FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_moderation_filters.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin','moderator') AND gm.removed_at IS NULL
    )
  );

-- ─── dawen_moderation_cases ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dawen_moderation_cases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  target_id  uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  case_type  text NOT NULL CHECK (case_type IN ('warn','mute','unmute','kick','ban','unban')),
  reason     text NOT NULL DEFAULT '',
  mute_until timestamptz,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dawen_moderation_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dawen_moderation_cases_admin_all"
  ON dawen_moderation_cases FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_moderation_cases.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin','moderator') AND gm.removed_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_moderation_cases.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin','moderator') AND gm.removed_at IS NULL
    )
  );

CREATE POLICY "dawen_moderation_cases_target_select"
  ON dawen_moderation_cases FOR SELECT TO authenticated
  USING (
    target_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_moderation_cases.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin','moderator') AND gm.removed_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_dawen_mod_cases_group ON dawen_moderation_cases(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dawen_mod_cases_target ON dawen_moderation_cases(group_id, target_id, case_type);

-- ─── dawen_captcha_sessions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dawen_captcha_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  challenge   text NOT NULL,
  answer      text NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  is_verified boolean NOT NULL DEFAULT false,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

ALTER TABLE dawen_captcha_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_dawen_captcha_sessions ON dawen_captcha_sessions(group_id, user_id);

-- ─── dawen_member_permissions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dawen_member_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_by  uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

ALTER TABLE dawen_member_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dawen_member_permissions_admin_all"
  ON dawen_member_permissions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_member_permissions.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_member_permissions.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  );

CREATE POLICY "dawen_member_permissions_self_select"
  ON dawen_member_permissions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = dawen_member_permissions.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_dawen_member_permissions ON dawen_member_permissions(group_id, user_id);

-- ─── raid_tasks ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS raid_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  bot_id            uuid REFERENCES dawen_bots(id) ON DELETE SET NULL,
  created_by        uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text NOT NULL DEFAULT '',
  target_url        text NOT NULL,
  target_type       text NOT NULL DEFAULT 'x_post'
                    CHECK (target_type IN ('x_post','x_account','x_space')),
  required_actions  text[] NOT NULL DEFAULT ARRAY['like','repost']::text[],
  reward_points     int NOT NULL DEFAULT 0,
  max_participants  int,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','cancelled')),
  ends_at           timestamptz,
  participant_count int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE raid_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raid_tasks_admin_all"
  ON raid_tasks FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = raid_tasks.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = raid_tasks.group_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  );

CREATE POLICY "raid_tasks_member_select"
  ON raid_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = raid_tasks.group_id AND gm.user_id = auth.uid()
        AND gm.removed_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_raid_tasks_group ON raid_tasks(group_id, status);

-- ─── raid_participants ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS raid_participants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raid_task_id uuid NOT NULL REFERENCES raid_tasks(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  actions_done text[] NOT NULL DEFAULT ARRAY[]::text[],
  proof_url    text,
  proof_note   text,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','submitted','verified','rejected')),
  submitted_at timestamptz,
  verified_at  timestamptz,
  verified_by  uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (raid_task_id, user_id)
);

ALTER TABLE raid_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raid_participants_self_all"
  ON raid_participants FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "raid_participants_admin_update"
  ON raid_participants FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM raid_tasks rt
      JOIN group_members gm ON gm.group_id = rt.group_id
      WHERE rt.id = raid_participants.raid_task_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM raid_tasks rt
      JOIN group_members gm ON gm.group_id = rt.group_id
      WHERE rt.id = raid_participants.raid_task_id AND gm.user_id = auth.uid()
        AND gm.role IN ('creator','admin') AND gm.removed_at IS NULL
    )
  );

CREATE POLICY "raid_participants_member_select"
  ON raid_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM raid_tasks rt
      JOIN group_members gm ON gm.group_id = rt.group_id
      WHERE rt.id = raid_participants.raid_task_id AND gm.user_id = auth.uid()
        AND gm.removed_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_raid_participants_task ON raid_participants(raid_task_id);
CREATE INDEX IF NOT EXISTS idx_raid_participants_user ON raid_participants(user_id);

-- Trigger: keep participant_count in sync
CREATE OR REPLACE FUNCTION update_raid_participant_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE raid_tasks SET participant_count = participant_count + 1 WHERE id = NEW.raid_task_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE raid_tasks SET participant_count = GREATEST(0, participant_count - 1) WHERE id = OLD.raid_task_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_raid_participant_count
  AFTER INSERT OR DELETE ON raid_participants
  FOR EACH ROW EXECUTE FUNCTION update_raid_participant_count();

-- ─── x_account_links ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS x_account_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE UNIQUE,
  x_user_id      text NOT NULL,
  x_username     text NOT NULL,
  x_display_name text,
  x_avatar_url   text,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','unlinked')),
  linked_at      timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE x_account_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "x_account_links_self_all"
  ON x_account_links FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "x_account_links_member_select"
  ON x_account_links FOR SELECT TO authenticated
  USING (
    status = 'active' AND (
      user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM raid_participants rp
        JOIN raid_tasks rt ON rt.id = rp.raid_task_id
        JOIN group_members gm ON gm.group_id = rt.group_id
        WHERE rp.user_id = x_account_links.user_id AND gm.user_id = auth.uid()
          AND gm.removed_at IS NULL
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_x_account_links_user_id ON x_account_links(user_id);

-- ─── Realtime ─────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE raid_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE raid_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE dawen_bots;
ALTER PUBLICATION supabase_realtime ADD TABLE dawen_moderation_cases;

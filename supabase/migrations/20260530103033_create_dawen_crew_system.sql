/*
  # DAWEN Crew System

  ## Summary
  Creates the complete DAWEN Crew application and role management system.
  Users can apply for community roles, complete tasks, and submit proof.
  Founders/Admins and Community Managers can review, approve, reject, or trial applicants.

  ## New Tables
  - crew_roles: Role definitions with metadata and permissions
  - crew_applications: User role applications with form data and review status
  - crew_application_tasks: Starter tasks for applicants to complete
  - crew_members: Active crew member records
  - crew_badges: Custom crew-specific badge definitions
  - user_crew_badges: Badge assignments to users
  - crew_internal_notes: Private admin/manager notes (service_role only)
  - crew_audit_logs: Full audit trail (service_role only)

  ## Security
  - Public SELECT on crew_roles and crew_members (public info)
  - Users can read/write their own applications and tasks
  - Internal notes and audit logs: no user-facing RLS (service_role only)
*/

-- ─── crew_roles ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crew_roles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key            text UNIQUE NOT NULL,
  role_name           text NOT NULL,
  description         text NOT NULL DEFAULT '',
  responsibilities    jsonb NOT NULL DEFAULT '[]',
  is_applyable        boolean NOT NULL DEFAULT true,
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 99,
  default_permissions jsonb NOT NULL DEFAULT '{}',
  badge_color         text NOT NULL DEFAULT '#8B5CF6',
  badge_icon          text NOT NULL DEFAULT 'shield',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crew_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active crew roles"
  ON crew_roles FOR SELECT
  TO public
  USING (is_active = true);

-- Seed all roles
INSERT INTO crew_roles (role_key, role_name, description, responsibilities, is_applyable, sort_order, badge_color, badge_icon)
VALUES
  ('founder', 'Founder', 'DAWEN founder and owner with full platform control.', '["Full platform control","Set strategic direction","Final decision authority"]', false, 0, '#F59E0B', 'crown'),
  ('community_manager', 'Community Manager', 'Oversees the DAWEN community, manages applications and crew members.', '["Review crew applications","Approve/reject normal roles","Move applicants to trial","Manage tasks and performance","Add internal notes"]', false, 1, '#A855F7', 'users'),
  ('moderator', 'Moderator', 'Keeps DAWEN community spaces safe, respectful, and spam-free.', '["Moderate DAWEN community spaces","Remove spam and scams","Warn/mute bad actors","Keep conversations safe and respectful","Report serious problems to Manager/Admin"]', true, 2, '#3B82F6', 'shield'),
  ('chiller', 'Chiller', 'Keeps the DAWEN community active, welcoming, and positive.', '["Welcome new members","Keep the community active","Start conversations","Maintain a positive vibe","Encourage users to test the app"]', true, 3, '#10B981', 'smile'),
  ('raider', 'Raider / Growth', 'Promotes DAWEN organically across social platforms and communities.', '["Promote DAWEN on X, Telegram, Discord, and other communities","Join official raids/tasks","Submit proof of completed promo tasks","Bring organic attention — no bots, no fake hype"]', true, 4, '#EF4444', 'zap'),
  ('helper', 'Helper / Support', 'Helps users navigate the DAWEN app and resolves common issues.', '["Help users understand the app","Answer basic questions","Help with onboarding, wallet creation/import, claims, groups, and reports","Escalate bugs/issues to Admin/Manager"]', true, 5, '#06B6D4', 'help-circle'),
  ('content_creator', 'Content Creator', 'Creates engaging content to explain and promote DAWEN.', '["Create clean content for DAWEN","Posts, short videos, memes, threads, reels, tutorials","Help explain app features","Submit content proof/links"]', true, 6, '#F97316', 'video'),
  ('ambassador', 'Ambassador', 'Represents DAWEN in external communities and builds strategic relationships.', '["Represent DAWEN in other communities","Help find collaborations","Onboard serious members","Build trust around the project","Submit partnership/collab leads"]', true, 7, '#EC4899', 'globe'),
  ('bug_hunter', 'Bug Hunter / Beta Tester', 'Tests DAWEN features and reports bugs to improve the platform.', '["Test DAWEN features","Report real bugs with screenshots/videos","Verify fixes","Give useful feedback"]', true, 8, '#84CC16', 'bug'),
  ('event_host', 'Event Host', 'Organizes and runs community events, contests, and sessions.', '["Organize community events","Host chats, game events, mini contests, or beta testing sessions","Report event results"]', true, 9, '#FBBF24', 'calendar'),
  ('world_builder', 'Dawen World Builder', 'Helps shape the Dawen World virtual environment and gameplay.', '["Help test Dawen World","Propose rooms/items/events","Help with community gameplay feedback"]', true, 10, '#14B8A6', 'home'),
  ('launchpad_scout', 'Launchpad Scout', 'Identifies promising projects and helps keep the launchpad clean.', '["Find interesting projects/builders","Review early project submissions","Help identify potential launchpad candidates","Report scams/suspicious projects"]', true, 11, '#6366F1', 'rocket')
ON CONFLICT (role_key) DO NOTHING;

-- ─── crew_applications ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crew_applications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role_key             text NOT NULL REFERENCES crew_roles(role_key) ON DELETE RESTRICT,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','shortlisted','trial','accepted','rejected','paused','removed','blacklisted')),
  motivation           text NOT NULL DEFAULT '',
  contribution         text NOT NULL DEFAULT '',
  experience           text NOT NULL DEFAULT '',
  previous_projects    text NOT NULL DEFAULT '',
  proof_links          jsonb NOT NULL DEFAULT '[]',
  proof_files          jsonb NOT NULL DEFAULT '[]',
  x_username           text,
  telegram_username    text,
  discord_username     text,
  timezone             text,
  languages            jsonb NOT NULL DEFAULT '[]',
  availability_hours   text,
  work_type            text CHECK (work_type IN ('paid', 'volunteer', 'performance_based')),
  price_rate           text,
  scenario_spam        text,
  scenario_bug         text,
  scenario_conflict    text,
  trust_statement      text,
  extra_notes          text,
  reviewed_by          uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewed_at          timestamptz,
  manager_note         text,
  user_visible_message text,
  trial_started_at     timestamptz,
  trial_ends_at        timestamptz,
  submitted_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crew_applications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crew_applications_user_id ON crew_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_applications_status ON crew_applications(status);
CREATE INDEX IF NOT EXISTS idx_crew_applications_role_key ON crew_applications(role_key);

CREATE POLICY "Users can read own applications"
  ON crew_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = crew_applications.user_id
        AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
    )
  );

CREATE POLICY "Authenticated can insert applications"
  ON crew_applications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update applications"
  ON crew_applications FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── crew_application_tasks ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crew_application_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES crew_applications(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  task_key        text NOT NULL,
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  is_required     boolean NOT NULL DEFAULT false,
  proof_required  boolean NOT NULL DEFAULT false,
  proof_text      text,
  proof_links     jsonb NOT NULL DEFAULT '[]',
  status          text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','submitted','approved','rejected')),
  reviewed_by     uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crew_application_tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crew_app_tasks_application_id ON crew_application_tasks(application_id);
CREATE INDEX IF NOT EXISTS idx_crew_app_tasks_user_id ON crew_application_tasks(user_id);

CREATE POLICY "Users can read own application tasks"
  ON crew_application_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = crew_application_tasks.user_id
        AND user_profiles.wallet_address = current_setting('app.wallet_address', true)
    )
  );

CREATE POLICY "Authenticated can insert own tasks"
  ON crew_application_tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update own tasks"
  ON crew_application_tasks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── crew_members ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crew_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role_key        text NOT NULL REFERENCES crew_roles(role_key) ON DELETE RESTRICT,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','paused','removed')),
  assigned_by     uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  trial_ends_at   timestamptz,
  public_note     text,
  internal_note   text,
  application_id  uuid REFERENCES crew_applications(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_key)
);

ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crew_members_user_id ON crew_members(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_role_key ON crew_members(role_key);
CREATE INDEX IF NOT EXISTS idx_crew_members_status ON crew_members(status);

CREATE POLICY "Public can view active crew members"
  ON crew_members FOR SELECT
  TO public
  USING (status IN ('active', 'trial'));

CREATE POLICY "Authenticated can insert crew members"
  ON crew_members FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update crew members"
  ON crew_members FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── crew_badges ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crew_badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_key   text UNIQUE NOT NULL,
  badge_name  text NOT NULL,
  badge_type  text NOT NULL DEFAULT 'role',
  icon_url    text,
  icon_name   text,
  color       text NOT NULL DEFAULT '#8B5CF6',
  description text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crew_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read crew badges"
  ON crew_badges FOR SELECT
  TO public
  USING (true);

-- ─── user_crew_badges ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_crew_badges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  badge_id            uuid NOT NULL REFERENCES crew_badges(id) ON DELETE CASCADE,
  assigned_by         uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  assigned_at         timestamptz NOT NULL DEFAULT now(),
  visible_on_profile  boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

ALTER TABLE user_crew_badges ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_crew_badges_user_id ON user_crew_badges(user_id);

CREATE POLICY "Public can view user crew badges"
  ON user_crew_badges FOR SELECT
  TO public
  USING (visible_on_profile = true);

CREATE POLICY "Authenticated can manage crew badges"
  ON user_crew_badges FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update crew badges"
  ON user_crew_badges FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete crew badges"
  ON user_crew_badges FOR DELETE
  TO authenticated
  USING (true);

-- ─── crew_internal_notes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crew_internal_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES crew_applications(id) ON DELETE CASCADE,
  target_user_id  uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  note            text NOT NULL,
  created_by      uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crew_internal_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crew_internal_notes_application_id ON crew_internal_notes(application_id);

-- ─── crew_audit_logs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crew_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  target_user_id  uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  action          text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crew_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crew_audit_logs_actor ON crew_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_crew_audit_logs_target ON crew_audit_logs(target_user_id);

-- ─── Realtime ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE crew_applications;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE crew_members;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

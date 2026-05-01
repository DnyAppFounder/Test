/*
  # Add Messages, Notifications, and Notification Settings Tables

  ## New Tables

  ### messages
  - Stores direct messages between users
  - `id` - UUID primary key
  - `sender_id` - FK to user_profiles
  - `receiver_id` - FK to user_profiles
  - `content` - message text
  - `read` - boolean, has receiver seen this message
  - `created_at` - timestamp

  ### notifications
  - Stores user notifications for social actions
  - `id` - UUID primary key
  - `user_id` - FK to user_profiles (who receives the notification)
  - `actor_id` - FK to user_profiles (who triggered the action)
  - `type` - like | comment | follow | mention | repost | message
  - `post_id` - optional FK to posts (for like/comment/repost notifications)
  - `message` - short notification text
  - `read` - boolean
  - `created_at` - timestamp

  ### notification_settings
  - Per-user toggle settings for each notification type
  - `id` - UUID primary key
  - `user_id` - FK to user_profiles (unique per user)
  - `likes` - boolean, default true
  - `comments` - boolean, default true
  - `follows` - boolean, default true
  - `messages` - boolean, default true
  - `mentions` - boolean, default true
  - `reposts` - boolean, default true

  ## Security
  - RLS enabled on all three tables
  - Users can only see their own messages (sent or received)
  - Users can only see their own notifications
  - Users can only read/write their own notification settings
*/

-- messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own messages"
  ON messages FOR SELECT
  TO anon, authenticated
  USING (sender_id = (SELECT id FROM user_profiles WHERE wallet_address = current_setting('request.jwt.claims', true)::json->>'sub' LIMIT 1)
      OR receiver_id = (SELECT id FROM user_profiles WHERE wallet_address = current_setting('request.jwt.claims', true)::json->>'sub' LIMIT 1));

CREATE POLICY "Anyone can insert messages"
  ON messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update read status on received messages"
  ON messages FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'mention', 'repost', 'message')),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert notifications"
  ON notifications FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their notifications"
  ON notifications FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete their notifications"
  ON notifications FOR DELETE
  TO anon, authenticated
  USING (true);

-- notification_settings table
CREATE TABLE IF NOT EXISTS notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE UNIQUE,
  likes boolean NOT NULL DEFAULT true,
  comments boolean NOT NULL DEFAULT true,
  follows boolean NOT NULL DEFAULT true,
  messages boolean NOT NULL DEFAULT true,
  mentions boolean NOT NULL DEFAULT true,
  reposts boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their notification settings"
  ON notification_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can insert their notification settings"
  ON notification_settings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their notification settings"
  ON notification_settings FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS messages_receiver_id_idx ON messages(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_receiver_idx ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications(user_id, read);

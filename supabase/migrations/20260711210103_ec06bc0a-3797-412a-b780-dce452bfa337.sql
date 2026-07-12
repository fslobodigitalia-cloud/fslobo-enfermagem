
-- FOLLOWS
CREATE TABLE public.community_follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX idx_follows_following ON public.community_follows(following_id);
CREATE INDEX idx_follows_follower ON public.community_follows(follower_id);

GRANT SELECT, INSERT, DELETE ON public.community_follows TO authenticated;
GRANT ALL ON public.community_follows TO service_role;

ALTER TABLE public.community_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows viewable by authenticated"
  ON public.community_follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "users can follow"
  ON public.community_follows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "users can unfollow"
  ON public.community_follows FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

-- DIRECT MESSAGES
CREATE TABLE public.community_direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX idx_dm_pair_created ON public.community_direct_messages(sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_dm_recipient_unread ON public.community_direct_messages(recipient_id) WHERE read_at IS NULL AND deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_direct_messages TO authenticated;
GRANT ALL ON public.community_direct_messages TO service_role;

ALTER TABLE public.community_direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants read"
  ON public.community_direct_messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "sender inserts"
  ON public.community_direct_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "recipient marks read or sender edits"
  ON public.community_direct_messages FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id OR auth.uid() = sender_id)
  WITH CHECK (auth.uid() = recipient_id OR auth.uid() = sender_id);
CREATE POLICY "sender deletes"
  ON public.community_direct_messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_direct_messages;
ALTER TABLE public.community_direct_messages REPLICA IDENTITY FULL;


-- GROUPS
CREATE TABLE public.community_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(name) BETWEEN 3 AND 80),
  description text,
  category text,
  cover_url text,
  is_private boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  members_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_groups_category ON public.community_groups(category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_groups TO authenticated;
GRANT ALL ON public.community_groups TO service_role;

ALTER TABLE public.community_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups viewable" ON public.community_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth creates groups" ON public.community_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "creator or admin updates" ON public.community_groups FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "creator or admin deletes" ON public.community_groups FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_groups_updated BEFORE UPDATE ON public.community_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- GROUP MEMBERS
CREATE TABLE public.community_group_members (
  group_id uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX idx_group_members_user ON public.community_group_members(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_group_members TO authenticated;
GRANT ALL ON public.community_group_members TO service_role;

ALTER TABLE public.community_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members viewable" ON public.community_group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "user joins" ON public.community_group_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user leaves" ON public.community_group_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.bump_group_members() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_groups SET members_count = members_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_groups SET members_count = GREATEST(0, members_count - 1) WHERE id = OLD.group_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_group_members_count
  AFTER INSERT OR DELETE ON public.community_group_members
  FOR EACH ROW EXECUTE FUNCTION public.bump_group_members();

-- Auto-add creator as admin
CREATE OR REPLACE FUNCTION public.add_group_creator() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.community_group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'admin')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_group_add_creator
  AFTER INSERT ON public.community_groups
  FOR EACH ROW EXECUTE FUNCTION public.add_group_creator();

-- EVENTS
CREATE TABLE public.community_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.community_groups(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 140),
  description text,
  cover_url text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text,
  is_online boolean NOT NULL DEFAULT false,
  url text,
  attendees_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_start ON public.community_events(starts_at);
CREATE INDEX idx_events_group ON public.community_events(group_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_events TO authenticated;
GRANT ALL ON public.community_events TO service_role;

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events viewable" ON public.community_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth creates events" ON public.community_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "creator or admin updates events" ON public.community_events FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "creator or admin deletes events" ON public.community_events FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.community_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- EVENT ATTENDEES
CREATE TABLE public.community_event_attendees (
  event_id uuid NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'going' CHECK (status IN ('going','interested')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX idx_event_attendees_user ON public.community_event_attendees(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_event_attendees TO authenticated;
GRANT ALL ON public.community_event_attendees TO service_role;

ALTER TABLE public.community_event_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendees viewable" ON public.community_event_attendees FOR SELECT TO authenticated USING (true);
CREATE POLICY "user rsvps" ON public.community_event_attendees FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user updates rsvp" ON public.community_event_attendees FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user cancels rsvp" ON public.community_event_attendees FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.bump_event_attendees() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_events SET attendees_count = attendees_count + 1 WHERE id = NEW.event_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_events SET attendees_count = GREATEST(0, attendees_count - 1) WHERE id = OLD.event_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_event_attendees_count
  AFTER INSERT OR DELETE ON public.community_event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.bump_event_attendees();

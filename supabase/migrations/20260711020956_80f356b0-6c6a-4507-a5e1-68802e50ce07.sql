
CREATE OR REPLACE FUNCTION public.add_user_xp(_user_id UUID, _amount INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today DATE := (now() AT TIME ZONE 'UTC')::date;
  _prev DATE;
  _cs INT;
  _ls INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _amount IS NULL OR _amount < 0 OR _amount > 500 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  INSERT INTO public.user_stats(user_id, xp, level, current_streak, longest_streak, last_activity_date)
  VALUES (_user_id, _amount, 1, 1, 1, _today)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_activity_date, current_streak, longest_streak
    INTO _prev, _cs, _ls
    FROM public.user_stats WHERE user_id = _user_id;

  IF _prev IS NULL OR _prev = _today THEN
    _cs := COALESCE(_cs, 1);
  ELSIF _prev = _today - INTERVAL '1 day' THEN
    _cs := COALESCE(_cs, 0) + 1;
  ELSE
    _cs := 1;
  END IF;
  _ls := GREATEST(COALESCE(_ls, 0), _cs);

  UPDATE public.user_stats
     SET xp = xp + _amount,
         level = GREATEST(1, ((xp + _amount) / 100) + 1),
         current_streak = _cs,
         longest_streak = _ls,
         last_activity_date = _today
   WHERE user_id = _user_id;
END;
$$;

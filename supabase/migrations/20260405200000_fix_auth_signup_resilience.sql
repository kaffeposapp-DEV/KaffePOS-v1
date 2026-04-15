-- Make profile creation resilient when requested usernames collide.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  candidate_username TEXT;
BEGIN
  base_username := lower(regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    '[^a-zA-Z0-9_]+',
    '_',
    'g'
  ));

  base_username := trim(both '_' from base_username);
  IF base_username IS NULL OR length(base_username) < 3 THEN
    base_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 8);
  END IF;

  candidate_username := left(base_username, 30);

  WHILE EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE username = candidate_username
  ) LOOP
    candidate_username := left(base_username, 21) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  END LOOP;

  INSERT INTO public.profiles (id, username, email, display_name)
  VALUES (
    NEW.id,
    candidate_username,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );

  RETURN NEW;
END;
$$;

-- ============================================================
-- Migration 002 : réparation d'un schéma student_profiles existant
-- Utiliser si la table existe déjà mais avec mauvais types / mauvaises policies
-- ============================================================

CREATE TABLE IF NOT EXISTS public.student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_user_id text NOT NULL,
  profile_id text NOT NULL,
  profile_name text,
  selected_class text,
  provider text DEFAULT 'supabase',
  email text,
  google_enabled boolean DEFAULT false,
  payload jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

DROP POLICY IF EXISTS "Allow all to anon" ON public.student_profiles;
DROP POLICY IF EXISTS "Allow all to authenticated" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_select_own" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_insert_own" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_update_own" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_delete_own" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_select_all" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_insert_all" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_update_all" ON public.student_profiles;
DROP POLICY IF EXISTS "student_profiles_delete_all" ON public.student_profiles;

ALTER TABLE public.student_profiles
  DROP CONSTRAINT IF EXISTS student_profiles_remote_user_id_fkey;

ALTER TABLE public.student_profiles
  DROP CONSTRAINT IF EXISTS student_profiles_profile_id_fkey;

ALTER TABLE public.student_profiles
  ALTER COLUMN remote_user_id TYPE text USING remote_user_id::text,
  ALTER COLUMN profile_id TYPE text USING profile_id::text,
  ALTER COLUMN profile_name TYPE text USING profile_name::text,
  ALTER COLUMN selected_class TYPE text USING selected_class::text,
  ALTER COLUMN provider TYPE text USING provider::text,
  ALTER COLUMN email TYPE text USING email::text,
  ALTER COLUMN google_enabled SET DEFAULT false,
  ALTER COLUMN payload TYPE jsonb USING COALESCE(payload::jsonb, '{}'::jsonb),
  ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.student_profiles
  ALTER COLUMN remote_user_id SET NOT NULL,
  ALTER COLUMN profile_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_student_profiles_remote_profile'
  ) THEN
    ALTER TABLE public.student_profiles
      ADD CONSTRAINT uq_student_profiles_remote_profile UNIQUE (remote_user_id, profile_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_profiles_remote_user_id
  ON public.student_profiles (remote_user_id);

CREATE INDEX IF NOT EXISTS idx_student_profiles_updated_at
  ON public.student_profiles (updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_student_profiles_updated_at ON public.student_profiles;

CREATE TRIGGER trg_student_profiles_updated_at
  BEFORE UPDATE ON public.student_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all to anon"
  ON public.student_profiles
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all to authenticated"
  ON public.student_profiles
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

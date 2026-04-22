-- ============================================================
-- Migration 001 : création de la table student_profiles
-- Pour Supabase BacBooster multi-compte / multi-profil
-- ============================================================

CREATE TABLE IF NOT EXISTS public.student_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_user_id text NOT NULL,
  profile_id     text NOT NULL,
  profile_name   text,
  selected_class text,
  provider       text DEFAULT 'supabase',
  email          text,
  google_enabled boolean DEFAULT false,
  payload        jsonb DEFAULT '{}',
  updated_at     timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now(),

  CONSTRAINT uq_student_profiles_remote_profile
    UNIQUE (remote_user_id, profile_id)
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_student_profiles_remote_user_id
  ON public.student_profiles (remote_user_id);

CREATE INDEX IF NOT EXISTS idx_student_profiles_updated_at
  ON public.student_profiles (updated_at DESC);

-- Trigger pour auto-update de updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_student_profiles_updated_at
  ON public.student_profiles;

CREATE TRIGGER trg_student_profiles_updated_at
  BEFORE UPDATE ON public.student_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- RLS : pour un usage MVP, on autorise toutes les opérations
-- au rôle "anon" car le contrôle d’accès est géré côté app.
-- Si vous préférez un contrôle strict, adaptez les policies.
-- ============================================================

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

-- Permettre toutes les opérations à anon (clé publique)
-- L’application filtre déjà par remote_user_id côté client.
CREATE POLICY IF NOT EXISTS "Allow all to anon"
  ON public.student_profiles
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Permettre toutes les opérations à authenticated (si vous migrez vers auth.uid plus tard)
CREATE POLICY IF NOT EXISTS "Allow all to authenticated"
  ON public.student_profiles
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- VIOLET Local PostgreSQL Migration 007: Owner Bootstrap (Table 39)
-- Establishes the singleton owner bootstrap registry for private, single-owner local authentication.

-- 39. Violet Owner Bootstrap
CREATE TABLE IF NOT EXISTS public.violet_owner_bootstrap (
  id text PRIMARY KEY DEFAULT 'singleton',
  is_bootstrapped boolean NOT NULL DEFAULT false,
  owner_email text,
  owner_id uuid,
  bootstrapped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT violet_owner_bootstrap_singleton CHECK (id = 'singleton')
);

-- Seed singleton initial row if absent
INSERT INTO public.violet_owner_bootstrap (id, is_bootstrapped)
VALUES ('singleton', false)
ON CONFLICT (id) DO NOTHING;

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS violet_owner_bootstrap_set_updated_at ON public.violet_owner_bootstrap;
CREATE TRIGGER violet_owner_bootstrap_set_updated_at
  BEFORE UPDATE ON public.violet_owner_bootstrap
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- VIOLET Local PostgreSQL Migration 008: Local Auth Sessions & Security Tokens
-- Establishes server-managed sessions and password reset tokens in PostgreSQL.

CREATE TABLE IF NOT EXISTS public.local_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.local_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS local_sessions_token_hash_idx ON public.local_sessions (token_hash);
CREATE INDEX IF NOT EXISTS local_sessions_user_expires_idx ON public.local_sessions (user_id, expires_at);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.local_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_hash_idx ON public.password_reset_tokens (token_hash);

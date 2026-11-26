-- VIOLET Local PostgreSQL Migration 001: Core Extensions & Auth Compat
-- Establishes extensions, auth and storage schemas, compatibility functions, and local users.

-- 1. Core Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Auth Schema Compatibility
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token text,
  confirmation_sent_at timestamptz,
  recovery_token text,
  recovery_sent_at timestamptz,
  email_change_token_new text,
  email_change text,
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  is_super_admin boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  phone text,
  phone_confirmed_at timestamptz,
  phone_change text,
  phone_change_token text,
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz,
  email_change_token_current text,
  email_change_confirm_status smallint,
  banned_until timestamptz,
  reauthentication_token text,
  reauthentication_sent_at timestamptz,
  is_sso_user boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  is_anonymous boolean NOT NULL DEFAULT false
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
$$;

-- 3. Local Users Table
CREATE TABLE IF NOT EXISTS public.local_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'user')),
  display_name text,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Storage Schema Compatibility
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id) ON DELETE CASCADE,
  name text,
  owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED
);

-- 5. Extensions & Vector Fallback
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension not installed, using fallback vector support';
  END;
END $$;

-- Cosine distance fallback function for float8[]
CREATE OR REPLACE FUNCTION extensions.cosine_distance(a float8[], b float8[])
RETURNS float8
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  dot_product float8 := 0;
  norm_a float8 := 0;
  norm_b float8 := 0;
  dim int;
  i int;
BEGIN
  IF a IS NULL OR b IS NULL THEN
    RETURN NULL;
  END IF;
  dim := cardinality(a);
  IF dim = 0 OR dim != cardinality(b) THEN
    RETURN 1.0;
  END IF;
  FOR i IN 1..dim LOOP
    dot_product := dot_product + (a[i] * b[i]);
    norm_a := norm_a + (a[i] * a[i]);
    norm_b := norm_b + (b[i] * b[i]);
  END LOOP;
  IF norm_a = 0 OR norm_b = 0 THEN
    RETURN 1.0;
  END IF;
  RETURN 1.0 - (dot_product / (sqrt(norm_a) * sqrt(norm_b)));
END;
$$;

-- Conditional creation of operator <=> in schema extensions for float8[]
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_operator op
    JOIN pg_namespace ns ON op.oprnamespace = ns.oid
    WHERE ns.nspname = 'extensions' AND op.oprname = '<=>'
  ) THEN
    CREATE OPERATOR extensions.<=> (
      LEFTARG = float8[],
      RIGHTARG = float8[],
      FUNCTION = extensions.cosine_distance
    );
  END IF;
END $$;

-- 6. Schema Migrations Tracking Table
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

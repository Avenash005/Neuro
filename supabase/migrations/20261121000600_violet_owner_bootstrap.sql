-- Phase 3G: VIOLET One-Time Owner Bootstrap & Persistent Authentication
-- Migration: 20261121000600_violet_owner_bootstrap.sql

CREATE TABLE IF NOT EXISTS violet_owner_bootstrap (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    is_bootstrapped BOOLEAN NOT NULL DEFAULT false,
    owner_email TEXT,
    owner_id UUID,
    bootstrapped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE violet_owner_bootstrap ENABLE ROW LEVEL SECURITY;

-- Allow public read of bootstrap status so unauthenticated clients can detect if system is in first-run setup mode
DROP POLICY IF EXISTS "Allow public read of owner bootstrap status" ON violet_owner_bootstrap;
CREATE POLICY "Allow public read of owner bootstrap status"
    ON violet_owner_bootstrap
    FOR SELECT
    USING (true);

-- Allow authenticated owner to claim/update singleton bootstrap record
DROP POLICY IF EXISTS "Allow authenticated owner to claim bootstrap" ON violet_owner_bootstrap;
CREATE POLICY "Allow authenticated owner to claim bootstrap"
    ON violet_owner_bootstrap
    FOR ALL
    USING (auth.uid() IS NOT NULL);

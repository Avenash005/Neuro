# Phase 2B — Universal capture setup

Phase 2B adds a private `memory-files` bucket, durable file metadata, and a processing queue. Apply it after the Phase 2A migration.

## Apply the migration

1. Open the Supabase SQL Editor for the target project.
2. Copy all of `supabase/migrations/20260719000200_universal_capture.sql` into a new query.
3. Select the primary database and the `postgres` role.
4. Run the query once. It is safe to rerun because its schema and policies are idempotent.
5. In Storage, confirm `memory-files` exists and is **Private**.

Do not paste a service-role key into the application or `.env.local`. The browser needs only the project URL and publishable key.

## Verify in the app

1. Sign in to Neuron.
2. Select **Add memory → Upload**.
3. Upload a supported file no larger than 10 MB.
4. Open **Library** and confirm the item survives a refresh.
5. Use its download button and confirm the original file downloads.

Supported formats: PDF, JPEG, PNG, WebP, TXT, Markdown, DOCX, PPTX, XLSX, MP3, M4A/MP4, WAV, and WebM.

## Current processing behavior

The database automatically creates one queued job per captured source:

| Source | Queued job |
| --- | --- |
| Image | `ocr` |
| Audio | `transcribe` |
| PDF, Office, or text file | `extract` |
| Link | `fetch_url` |

Jobs remain queued until the Phase 2B processing worker is deployed. The UI already exposes queued/failed states and a retry action; it does not claim that extraction is complete.

## Security model

- The bucket is private.
- Object paths begin with the authenticated user's ID.
- Storage RLS permits users to insert, read, and delete only their own objects.
- Memory rows and processing status remain protected by database RLS.
- Validation runs in the browser and is repeated by the bucket's MIME and size constraints. A later worker must still treat all content as untrusted and perform malware/content inspection.

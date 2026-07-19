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

Jobs remain queued until the Phase 2B processing worker is deployed. Continue with [PHASE_2B_WORKER.md](PHASE_2B_WORKER.md). The UI exposes queued/processing/failed states, retry controls, private downloads, readable memory details, and confirmed permanent deletion.

## Duplicate protection

Migration `20260719000400_memory_deduplication.sql` adds an owner-scoped unique fingerprint. New uploads are identified by a SHA-256 digest of their bytes, so renaming a file does not bypass duplicate protection. New links are canonicalized before hashing: fragments and common tracking parameters are removed and query parameters are sorted. A pre-check provides a useful message, while the database index protects concurrent saves.

Existing rows are left unchanged because private historical files cannot be safely re-hashed from a SQL migration. Newly captured files and links receive fingerprints automatically.

## Signed uploads and progress

The authenticated browser requests a single-use signed upload URL from the private `memory-files` bucket. The signed URL remains in memory and expires automatically; it is never stored in the database or application logs. The upload uses Supabase's multipart signed-upload contract through `XMLHttpRequest` so Neuron can show real byte progress and cancel an in-flight request.

If the upload succeeds but memory creation fails, Neuron removes the uploaded object before returning the error. Closing the Capture modal aborts the active request. Signed URL creation still requires the owner's storage `insert` policy; using the signed URL itself requires no additional authorization header.

## Security model

- The bucket is private.
- Object paths begin with the authenticated user's ID.
- Storage RLS permits users to insert, read, and delete only their own objects.
- Memory rows and processing status remain protected by database RLS.
- Permanent deletion removes the private source object before deleting the memory; the memory foreign-key cascade removes its processing jobs.
- Duplicate fingerprints are unique within one owner account and remain invisible across accounts through memory RLS.
- Signed upload tokens are short-lived, kept in browser memory only, and scoped to one private object path.
- Validation runs in the browser and is repeated by the bucket's MIME and size constraints. A later worker must still treat all content as untrusted and perform malware/content inspection.

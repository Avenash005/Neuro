# Phase 2B — Processing worker deployment

The `process-memory` Supabase Edge Function turns queued sources into extracted text, a concise summary, and tags. It processes a newly saved memory when invoked by its owner and also supports secret-authenticated batch runs for a future schedule.

## What it processes

| Source | Processing path |
| --- | --- |
| TXT and Markdown | Local text extraction, followed by optional AI enrichment |
| Web link | Size-limited HTTP(S) fetch with redirect and private-network blocking |
| Image | Vision/OCR with `gpt-5.6-luna` using original image detail |
| PDF, DOCX, PPTX, XLSX | Responses API `input_file` extraction with `gpt-5.6-luna` |
| MP3, M4A/MP4, WAV, WebM | `gpt-4o-mini-transcribe`, followed by enrichment |

The model defaults can be changed with `OPENAI_EXTRACTION_MODEL` and `OPENAI_TRANSCRIPTION_MODEL`. Extraction uses `reasoning.effort: none`, structured output, a privacy-preserving safety identifier, and `store: false`.

## 1. Apply the worker migration

Run the complete file below in the Supabase SQL Editor using the `postgres` role:

```text
supabase/migrations/20260719000300_processing_worker.sql
```

It adds `extracted_text` and `extracted_at`, atomic queue claiming, completion/failure RPCs restricted to `service_role`, exponential retries, and recovery of jobs left running after a worker timeout.

## 2. Configure server-only secrets

Create an OpenAI API key from the OpenAI Platform. Do not place it in `.env.local`, frontend variables, source code, or Git.

In **Supabase Dashboard → Edge Functions → Secrets**, add:

```env
OPENAI_API_KEY=your_server_only_openai_key
OPENAI_EXTRACTION_MODEL=gpt-5.6-luna
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
WORKER_SECRET=a_long_random_value
```

The model variables are optional defaults. `OPENAI_API_KEY` is required for images, PDF/Office documents, and audio. Text and readable web pages retain a local extraction fallback if the key is temporarily absent.

## 3. Deploy the Edge Function

The recommended repeatable CLI flow is:

```bash
npx supabase login
npx supabase link --project-ref wanonpqnfdhyvyjfrtrf
npx supabase functions deploy process-memory
```

The repository's `supabase/config.toml` sets `verify_jwt = false` because the function verifies either the signed-in user's JWT or `WORKER_SECRET` itself. Never remove both checks or expose the service-role key.

You can alternatively create `process-memory` in the Supabase Dashboard and deploy the contents of `supabase/functions/process-memory/index.ts` with the same secrets.

## 4. Verify end to end

1. Refresh Neuron and sign in.
2. Upload a small image or text file.
3. Watch Library move from **Queued** to **AI processed**.
4. Confirm the row has `processing_status = 'ready'`, non-empty `extracted_text`, and `extracted_at` in Supabase Table Editor.
5. Confirm the summary appears in Library while the original private file still downloads.

If processing fails, Library exposes retry. The worker records a bounded error, retries transient failures up to three attempts with backoff, and marks configuration/validation errors as terminal.

## Optional batch/scheduled invocation

A scheduler can POST to:

```text
https://wanonpqnfdhyvyjfrtrf.supabase.co/functions/v1/process-memory
```

with JSON `{ "batchSize": 3 }` and the `x-worker-secret` header. Store the secret in Supabase Vault when configuring `pg_cron`/`pg_net`; do not embed it directly in SQL or client code.

## Privacy and security boundary

- Source files remain in the private Supabase bucket.
- The service-role key and OpenAI key exist only in the Edge Function environment.
- AI-supported source contents are sent to the configured OpenAI API account for processing.
- Responses are requested with storage disabled, but your organization’s OpenAI data controls and retention settings still apply.
- URL fetching blocks common private/local destinations, limits redirects and response size, and accepts readable text/HTML only. A production launch should add managed egress filtering and malware scanning.

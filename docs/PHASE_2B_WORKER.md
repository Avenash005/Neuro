# Phase 2B — Processing worker deployment

The `process-memory` Supabase Edge Function turns queued sources into extracted text, a concise summary, and tags. It processes a newly saved memory when invoked by its owner and also supports secret-authenticated batch runs for a future schedule.

## What it processes

| Source | Processing path |
| --- | --- |
| TXT and Markdown | Local text extraction, followed by NVIDIA enrichment |
| Web link | Size-limited HTTP(S) fetch with redirect and private-network blocking |
| PNG and JPEG image | NVIDIA Nemotron vision/OCR; large images use temporary private NVCF assets |
| DOCX, PPTX, XLSX | Local Open XML text extraction, followed by NVIDIA enrichment |
| PDF and legacy Office formats | Export as PNG/JPEG, a modern Office format, or plain text |
| English WAV, OGG, OPUS | NVIDIA Parakeet transcription, followed by enrichment |
| Other audio formats | Optional OpenAI transcription fallback when NVIDIA is not configured |

When `NVIDIA_API_KEY` is configured, NVIDIA is the primary provider. The default text and vision models can be changed with `NVIDIA_TEXT_MODEL` and `NVIDIA_VISION_MODEL`. OpenAI remains an optional fallback only when NVIDIA is not configured.

## 1. Apply the worker migration

Run the complete file below in the Supabase SQL Editor using the `postgres` role:

```text
supabase/migrations/20260719000300_processing_worker.sql
```

It adds `extracted_text` and `extracted_at`, atomic queue claiming, completion/failure RPCs restricted to `service_role`, exponential retries, and recovery of jobs left running after a worker timeout.

## 2. Configure server-only secrets

Create an NVIDIA hosted-inference key at build.nvidia.com. It normally begins with `nvapi-`. Do not place it in `.env.local`, frontend variables, source code, or Git.

In **Supabase Dashboard → Edge Functions → Secrets**, add:

```env
NVIDIA_API_KEY=your_server_only_nvapi_key
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_TEXT_MODEL=nvidia/nemotron-3-nano-30b-a3b
NVIDIA_VISION_MODEL=nvidia/nemotron-nano-12b-v2-vl
WORKER_SECRET=a_long_random_value
```

Only `NVIDIA_API_KEY` is required; the model and base URL variables have safe defaults. Text, readable web pages, and modern Office documents retain local extraction when no AI key is configured. `OPENAI_API_KEY`, `OPENAI_EXTRACTION_MODEL`, and `OPENAI_TRANSCRIPTION_MODEL` may be retained as an optional paid fallback when NVIDIA is not configured.

## 3. Deploy the Edge Function

The recommended repeatable CLI flow is:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
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
https://<your-project-ref>.supabase.co/functions/v1/process-memory
```

with JSON `{ "batchSize": 3 }` and the `x-worker-secret` header. Store the secret in Supabase Vault when configuring `pg_cron`/`pg_net`; do not embed it directly in SQL or client code.

## Privacy and security boundary

- Source files remain in the private Supabase bucket.
- The service-role and NVIDIA keys exist only in the Edge Function environment.
- AI-supported source contents are sent to NVIDIA's hosted endpoint. Large images are uploaded as temporary NVCF assets and deleted after inference.
- If the optional OpenAI fallback is configured and selected, that provider's account data controls and retention settings apply.
- URL fetching blocks common private/local destinations, limits redirects and response size, and accepts readable text/HTML only. A production launch should add managed egress filtering and malware scanning.

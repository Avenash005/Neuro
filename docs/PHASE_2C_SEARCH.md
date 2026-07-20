# Phase 2C — Private hybrid search

Neuron now searches each signed-in user's memories with both PostgreSQL full-text search and NVIDIA-generated semantic embeddings.

## What is live

- Weighted full-text indexing across title, summary, extracted text, and note content
- 1,024-dimension pgvector embeddings using `nvidia/llama-nemotron-embed-1b-v2`
- HNSW cosine index for semantic retrieval
- Reciprocal-rank fusion of keyword and meaning matches
- A server-only search RPC that always receives the verified user's ID
- An authenticated `search-memories` Edge Function; the NVIDIA key never reaches the browser
- Automatic embedding for new memories and owner-scoped backfill for existing memories
- Keyword-only fallback when the embedding provider is temporarily unavailable

## Deployment

The database changes are versioned in:

- `supabase/migrations/20260720000100_semantic_search.sql`
- `supabase/migrations/20260720000200_embedding_job_reliability.sql`

Apply and deploy with:

```powershell
npx --yes supabase@latest db push --linked
npx --yes supabase@latest functions deploy process-memory --project-ref wanonpqnfdhyvyjfrtrf --no-verify-jwt
npx --yes supabase@latest functions deploy search-memories --project-ref wanonpqnfdhyvyjfrtrf --no-verify-jwt
```

The existing `NVIDIA_API_KEY` secret is reused. The optional model override is:

```env
NVIDIA_EMBEDDING_MODEL=nvidia/llama-nemotron-embed-1b-v2
```

## Verification

1. Reload the app while signed in. This safely processes up to five queued jobs owned by that user.
2. Open search with `Ctrl+K`.
3. Try an exact phrase from a memory, then a paraphrase that uses different words.
4. Click a result and confirm that the exact private memory opens in Library.

Search returns only rows for the user ID validated from the bearer token. The underlying hybrid RPC is executable only by the Supabase service role.

## Next slice

Phase 2C is not complete yet. The next slice adds metadata/date/type filters, a dedicated reranker, grounded assistant answers with citations, and retrieval-quality evaluations.

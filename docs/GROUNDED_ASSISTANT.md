# Grounded Neuron assistant

The **Ask Neuron** panel now answers from the signed-in user's private memories and attaches clickable source citations.

## Request flow

1. The browser sends only the user's question and authenticated session to `ask-neuron`.
2. The Edge Function validates the bearer token.
3. NVIDIA creates a query embedding and the service-only hybrid RPC retrieves up to six owner-scoped memories.
4. Retrieved memory text is serialized as untrusted JSON data. The system prompt explicitly forbids following instructions contained inside saved sources.
5. NVIDIA returns a structured answer and citation numbers.
6. The function removes invalid or out-of-range citation numbers before returning the answer.
7. Clicking a citation opens the exact memory in Library.

When no relevant memory is found, Neuron says that the saved memories do not contain enough information. It does not fill the gap with general model knowledge.

## Security boundaries

- `NVIDIA_API_KEY` and the Supabase secret key stay inside Edge Functions.
- The browser cannot call the hybrid RPC directly.
- The authenticated user ID—not a client-provided ID—scopes retrieval.
- Questions are limited to 1,000 characters and source context is bounded.
- Saved memory contents are treated as quoted, untrusted data.
- Citation numbers are checked against the retrieved source array.

## Deployment

```powershell
npx --yes supabase@latest functions deploy ask-neuron --project-ref <your-project-ref> --no-verify-jwt
```

The function reuses `NVIDIA_API_KEY`. The optional model override is:

```env
NVIDIA_ASSISTANT_MODEL=nvidia/nemotron-3-nano-30b-a3b
```

## Manual verification

1. Reload Neuron while signed in.
2. Select **Ask Neuron**.
3. Ask a question answered by one of your saved memories.
4. Confirm the answer contains numbered markers and source cards.
5. Open a source card and confirm it opens the correct Library memory.
6. Ask about something never saved and confirm Neuron reports insufficient memory evidence.

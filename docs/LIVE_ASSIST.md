# Neuron Sidekick — Live Assist foundation

Neuron Sidekick helps a signed-in user prepare for a conversation or meeting from private memories they explicitly select. This milestone is an in-app preparation workspace, not a recorder, chat reader, or automated messaging agent.

## User flow

1. Open **Sidekick** from the sidebar.
2. Choose **Conversation** or **Meeting**.
3. Optionally name the person, project, or meeting.
4. Describe the current situation or the help needed.
5. Select up to eight private memories, directly or through a collection.
6. Generate a briefing containing supported context, talking points, explicit commitments, and questions.
7. Save the session so you can reopen the same memory set, prompt, and generated brief later.
8. Add manual follow-up notes to that saved session, optionally linking each note to one of the private memories.
9. Open citation buttons to verify the original memory, or copy individual suggestions or the entire brief manually.

## Privacy boundary

- Sidekick receives only the selected memory IDs and the text typed into its form.
- The function verifies the authenticated user owns every returned source.
- It cannot inspect WhatsApp, Slack, email, or another browser tab.
- It cannot activate a microphone or record a meeting.
- It never sends a message or posts content automatically.
- The interface clearly states these limitations before each request.

Future external integrations must preserve explicit activation, visible recording or reading indicators, participant consent, source scoping, and user-controlled insertion or sending.

## Grounding and prompt-injection protection

The `live-assist` Edge Function loads only selected owner-scoped memories and serializes their contents as untrusted JSON source data. Its system instructions prohibit following source instructions, guessing about another person, inventing work or commitments, and impersonating the user.

The server validates model output before returning it:

- The overview requires a valid citation.
- Every talking point, commitment, and question requires at least one valid citation.
- Out-of-range citations and uncited suggestions are discarded.
- Text, source count, and item counts are bounded.
- At least one selected UUID is required, with a maximum of eight.

## Files

- UI: `src/features/sidekick/SidekickView.tsx`
- Copy and selection helpers: `src/features/sidekick/liveAssist.ts`
- Server: `supabase/functions/live-assist/index.ts`
- Client boundary: `runLiveAssist` in `src/lib/supabase.ts`
- Persistence: `supabase/migrations/20260721000100_sidekick_sessions.sql`

## Next phases

1. Add consent-based live transcription with a visible recording state and retention controls.
2. Build an explicitly activated browser extension for supported messaging tools.
3. Keep all generated replies in suggestion mode; never send automatically.

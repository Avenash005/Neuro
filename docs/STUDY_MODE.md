# Study Mode

Study Mode turns useful knowledge in private memories into source-backed flashcards and multiple-choice quizzes.

## Generation

The existing `process-memory` call now returns up to six study cards alongside summaries, tags, entities, relationships, and action items. This does not make a second model request.

Each card contains:

- A direct question and correct answer
- Up to three plausible incorrect quiz options
- A confidence score
- A short evidence phrase from the source
- The source memory ID

The worker rejects empty cards, deduplicates normalized questions, removes duplicate options and options matching the correct answer, clamps confidence, and enforces length limits before storage.

## Study interface

Open **Study** from the sidebar.

- **Flashcards** reveal and hide answers while retaining evidence and a source link.
- **Quiz** presents stable shuffled options, immediate correction, progress, score, and restart controls.
- Search and source filters work in both modes.
- Opening a source returns to the complete private memory in Library.

Quiz scores are intentionally session-only in this milestone. Persisted reviews and scheduling belong to the next spaced-repetition phase.

## Existing memories and cost control

New memories receive Study analysis automatically during normal processing. Existing ready memories show an explicit **Analyze** action in Study:

- No background reprocessing or surprise provider spend
- Maximum three memories per request
- Visible progress and retry-safe job reuse
- `study_analyzed_at` prevents repeated spending even when a source yields no worthwhile cards

## Security

`study_cards` is protected by Row Level Security. Authenticated clients receive owner-scoped read access only. The service-role worker writes through `replace_memory_study_cards`, which accepts only a currently running job and derives the user and memory IDs from that job.

Schema changes:

- `supabase/migrations/20260720000800_study_cards.sql`
- `supabase/migrations/20260720000900_controlled_study_backfill.sql`

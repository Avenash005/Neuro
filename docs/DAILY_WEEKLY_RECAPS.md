# Daily and weekly recaps

Neuron’s Recaps page turns the signed-in user’s real workspace activity into a compact reflection. It supports today, the last seven days, and the last 30 days.

## What a recap includes

- Memories captured in the selected period
- AI-processed memory count
- Actions completed in the period and currently accepted tasks
- Active days and the current consecutive capture streak
- Most frequent normalized memory tags
- Capture-type breakdown for notes, uploads, links, and voice memories
- A day-by-day history with links back to source memories
- A recent or favorited memory worth revisiting

The Home dashboard’s weekly brief and streak now use the same calculations. The previous example topics, connection text, and hard-coded 12-day streak have been removed.

## Privacy and cost

Recaps are calculated in the browser from memories and action items already returned through owner-scoped Supabase Row Level Security. The feature does not send another request to an AI model, create another database table, or add provider cost.

## Implementation

- Pure calculations: `src/features/recaps/recaps.ts`
- Recaps interface: `src/features/recaps/RecapsView.tsx`
- Unit tests: `src/features/recaps/recaps.test.ts`

The calculation accepts an explicit current date in tests, uses local calendar-day boundaries, normalizes tag casing, and excludes activity outside the selected period.

## Future scale work

The current app loads the newest workspace memories into shared state. When accounts regularly exceed that client window, move recap aggregation to an owner-scoped SQL function with cursor-based history loading or stored periodic snapshots.

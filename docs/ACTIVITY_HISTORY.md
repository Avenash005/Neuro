# Activity history

Neuron's Activity page gives each signed-in user a private timeline built from their own Supabase memories.

## Included views

- Last 7 days, last 30 days, and all-time ranges
- Memories captured, AI-ready items, file uploads, and active-day totals
- Seven-day capture rhythm chart
- Breakdown by note, upload, link, and voice
- Daily history with processing status and timestamps
- One-click opening of the complete memory in Library

The page derives its information from the existing owner-scoped `memories` rows, so no public analytics table or extra user data is created.

## Interaction map

- Sidebar **Activity** and the notification bell open the history page.
- Dashboard **View work history** and the memory-stream arrow open Activity.
- Dashboard recent cards and Activity entries open the selected memory.
- Library type and sort controls filter the real list.
- Library and Dashboard stars toggle their visible favorite state for the session.
- Sidebar favorites and collection cards open private search.
- **New collection** creates a local working collection; persistent collections remain a later database phase.
- Settings opens the current account panel and Graph's **Find connections** opens Neuron.

## Next production upgrade

Persist tasks, favorites, collections, and explicit work events in Supabase. That will allow cross-device task completion history and richer daily or weekly AI recaps without relying only on memory creation timestamps.

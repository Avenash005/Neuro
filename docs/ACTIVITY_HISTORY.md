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
- Library and Dashboard stars update the owner's durable favorite state in Supabase.
- Sidebar favorites and collection cards open private search.
- **New collection** creates an owner-scoped Supabase collection. Library memory details can add or remove memberships, and deleting a collection keeps its memories.
- Settings opens the current account panel and Graph's **Find connections** opens Neuron.

## Next production upgrade

Persist tasks and explicit work events in Supabase. Favorites and manual collections are now durable; event storage will enable richer daily and weekly AI recaps without relying only on memory creation timestamps.

# Persistent organization

Neuron stores favorites and manual collections in Supabase instead of browser session state.

## User behavior

- Star a real memory from Dashboard, Library, or its detail view. The favorite state survives refreshes and follows the signed-in account.
- Create a collection from Collections. Names are unique per account, ignoring capitalization and surrounding whitespace.
- Open a Library memory and use its **Collections** section to add or remove it.
- Open a collection to review its memories, open one in Library, or remove its membership.
- Delete a collection without deleting the memories inside it.
- Deleting a memory automatically removes its collection memberships.

## Data model

- `memories.is_favorite` stores durable favorite state.
- `collections` stores owner-scoped collection metadata.
- `collection_memories` is the owner-scoped many-to-many membership table.
- Foreign keys cascade memberships when a memory or collection is deleted.
- Row Level Security limits all reads and writes to `auth.uid()` and validates ownership of both sides when a membership is created.

The versioned migration is `supabase/migrations/20260720000400_persistent_organization.sql`. The same final-state definitions are included in `supabase/schema.sql` for new projects.

## Verification

```bash
npm run check
npx supabase db lint --linked --level warning
```

Manual smoke test:

1. Sign in and create a collection.
2. Open a Library memory and add it to that collection.
3. Favorite the memory.
4. Refresh and confirm both states remain.
5. Delete the collection and confirm the memory still exists.

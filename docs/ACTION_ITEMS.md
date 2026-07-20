# Source-backed tasks and reminders

Neuron can extract explicit commitments, requests, tasks, and reminders while processing a memory. AI output never becomes an active task automatically: every new item starts as a **suggestion** and requires the signed-in user to accept or dismiss it.

## User flow

1. Save or reprocess a memory containing an explicit action, such as “Send the proposal to Maya by Friday at 3 PM.”
2. Open **Tasks** in the sidebar.
3. Review the source title, evidence, description, and explicit due date.
4. Accept the suggestion to move it to **To do**, or dismiss it.
5. Complete accepted tasks and reopen completed tasks when needed.

The Home dashboard shows up to three accepted tasks. Completing one there updates the same persisted record.

## Safety and ownership

- General facts and ideas must not be converted into tasks.
- A due date is stored only when the source explicitly provides one.
- Suggestions retain their source memory ID and a short evidence phrase.
- Row Level Security permits users to read only their own action items.
- Browser clients cannot insert or directly update task rows. A security-definer RPC validates ownership and permitted state transitions.
- Reprocessing can refresh pending suggestions, but cannot overwrite accepted, completed, or dismissed decisions.

## Data model

The migration is `supabase/migrations/20260720000700_action_items.sql`.

`action_items.status` follows these transitions:

```text
suggested -> accepted -> completed
    |
    +------> dismissed

completed -> accepted
```

The processing worker writes suggestions through `replace_memory_action_items`. The authenticated app changes state through `update_action_item_status`.

## Existing memories

Newly processed memories receive action-item analysis automatically. Existing ready memories can be reprocessed through the controlled analysis action in the Knowledge Graph; the same run refreshes entities, relationships, and task suggestions while keeping the three-memory cost cap.

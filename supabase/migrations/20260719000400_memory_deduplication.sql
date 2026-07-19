alter table public.memories
add column if not exists content_fingerprint text
check (
  content_fingerprint is null
  or content_fingerprint ~ '^(file|link):[0-9a-f]{64}$'
);

create unique index if not exists memories_user_content_fingerprint_uidx
on public.memories (user_id, content_fingerprint)
where content_fingerprint is not null;

comment on column public.memories.content_fingerprint is
'Client-computed SHA-256 identity for owner-scoped file and canonical-link duplicate prevention.';

-- Allow stable client conversation/message IDs while enforcing ownership in server routes.
alter table public.adam_messages drop constraint if exists adam_messages_conversation_id_fkey;
alter table public.adam_conversations alter column id type text using id::text;
alter table public.adam_messages alter column id type text using id::text;
alter table public.adam_messages alter column conversation_id type text using conversation_id::text;
alter table public.adam_messages add constraint adam_messages_conversation_id_fkey
  foreign key (conversation_id) references public.adam_conversations(id) on delete cascade;
create index if not exists adam_conversations_user_updated_idx on public.adam_conversations(user_id, updated_at desc);
create index if not exists adam_messages_conversation_created_idx on public.adam_messages(conversation_id, created_at);

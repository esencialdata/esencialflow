-- Create card_comments table
create table if not exists public.card_comments (
    id uuid default gen_random_uuid() primary key,
    card_id uuid not null references public.cards(id) on delete cascade,
    user_id text not null,
    text text not null,
    mentions jsonb default '[]'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Enable RLS for card_comments
alter table public.card_comments enable row level security;

create policy "Allow public access on card_comments"
    on public.card_comments for all
    using (true)
    with check (true);

create index if not exists card_comments_card_id_idx on public.card_comments (card_id);

-- Create Storage bucket for attachments files
insert into storage.buckets (id, name, public) 
values ('card_attachments', 'card_attachments', true)
on conflict (id) do nothing;

-- Enable RLS for storage.objects in card_attachments
create policy "Allow public read access to card_attachments"
    on storage.objects for select
    using (bucket_id = 'card_attachments');

create policy "Allow public insert access to card_attachments"
    on storage.objects for insert
    with check (bucket_id = 'card_attachments');

create policy "Allow public delete access to card_attachments"
    on storage.objects for delete
    using (bucket_id = 'card_attachments');

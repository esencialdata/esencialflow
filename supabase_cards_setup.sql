-- Create the 'cards' table
create table if not exists cards (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  list_id text not null, -- 'inbox', 'doing', 'done', etc.
  priority text check (priority in ('low', 'medium', 'high')) default 'medium',
  position double precision default 0,
  due_date timestamptz,
  completed boolean default false,
  completed_at timestamptz,
  archived boolean default false,
  archived_at timestamptz,
  assigned_to_user_id text,
  estimated_time int, -- in minutes
  actual_time int default 0, -- in minutes
  checklist jsonb default '[]',
  attachments jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table cards enable row level security;

-- Policy: Allow anonymous access (simplified for this migration as per previous instructions to focus on functionality first)
-- In a real production app, we would restrict this to authenticated users.
create policy "Allow public access"
  on cards for all
  using (true)
  with check (true);

-- Create an index on specific fields for performance
create index if not exists cards_list_id_idx on cards (list_id);
create index if not exists cards_priority_idx on cards (priority);

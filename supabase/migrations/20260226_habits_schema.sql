-- Drop existing tables if they exist to apply the new schema cleanly
DROP TABLE IF EXISTS public.habit_completions CASCADE;
DROP TABLE IF EXISTS public.habits CASCADE;

-- Create habits table
CREATE TABLE public.habits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'global',
    name TEXT NOT NULL,
    description TEXT,
    archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on the table
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

-- Policies for habits (Public access since the app relies on anon tokens)
CREATE POLICY "Allow public access on habits" 
    ON public.habits FOR ALL 
    USING (true)
    WITH CHECK (true);

-- Create habit_completions table
CREATE TABLE public.habit_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habit_id UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL DEFAULT 'global',
    date TEXT NOT NULL, -- Format: YYYY-MM-DD
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(habit_id, date)
);

ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;

-- Policies for habit_completions (Public access)
CREATE POLICY "Allow public access on habit_completions" 
    ON public.habit_completions FOR ALL 
    USING (true)
    WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_habits_user_id ON public.habits(user_id);
CREATE INDEX idx_habit_completions_habit_id ON public.habit_completions(habit_id);
CREATE INDEX idx_habit_completions_user_id_date ON public.habit_completions(user_id, date);

-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- ⚠️ IMPORTANT: Drop existing table/function to enforce 768 dimensions (Gemini)
drop table if exists strategy_vectors;
drop function if exists match_strategy_vectors;

-- Create a table to store your documents
create table strategy_vectors (
  id bigserial primary key,
  content text, -- The text content of the chunk
  metadata jsonb, -- Metadata (source, page, date, etc.)
  embedding vector(768) -- Gemini embedding vector (768 dimensions)
);

-- Create a function to search for documents
create or replace function match_strategy_vectors (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    strategy_vectors.id,
    strategy_vectors.content,
    strategy_vectors.metadata,
    1 - (strategy_vectors.embedding <=> query_embedding) as similarity
  from strategy_vectors
  where 1 - (strategy_vectors.embedding <=> query_embedding) > match_threshold
  order by strategy_vectors.embedding <=> query_embedding
  limit match_count;
end;
$$;

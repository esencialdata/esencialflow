-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- ⚠️ IMPORTANT: Drop existing table/function to enforce 3072 dimensions (Gemini modern)
drop table if exists strategy_vectors;
drop function if exists match_documents;
drop function if exists match_strategy_vectors;

-- Create a table to store your documents
-- Using 3072 dimensions for models/gemini-embedding-001
create table strategy_vectors (
  id bigserial primary key,
  content text,
  metadata jsonb,
  embedding vector(3072) -- Gemini embedding vector (3072 dimensions for gemini-embedding-001)
);

-- Create a function to search for documents
-- ⚠️ Named 'match_documents' to match LangChain/n8n defaults
-- ⚠️ Added 'filter' parameter to match LangChain signature
create or replace function match_documents (
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.1,
  match_count int DEFAULT 3,
  filter jsonb DEFAULT '{}'
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
  and strategy_vectors.metadata @> filter
  order by strategy_vectors.embedding <=> query_embedding
  limit match_count;
end;
$$;

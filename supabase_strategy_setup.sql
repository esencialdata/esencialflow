-- Habilitar extensión pgvector si no existe
create extension if not exists vector;

-- Crear tabla para almacenar los "Chunks Estratégicos v4.0" (Reglas del sistema para la IA)
create table if not exists strategy_vectors (
  id uuid default gen_random_uuid() primary key,
  content text not null,       -- Texto de la regla/estrategia
  metadata jsonb default '{}', -- Metadata adicional (e.g. tipo de regla, autor, versión)
  embedding vector(3072),      -- Vector para similitud, compatible con modelos Gemini 1.5
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Habilitar Row Level Security (RLS)
alter table strategy_vectors enable row level security;

-- Permitir lectura pública de las reglas estratégicas
create policy "Allow public read access to strategy"
  on strategy_vectors for select
  using (true);

-- Indexes para búsqueda más rápida (HNSW para mayor velocidad y escala)
-- Nota: En bases de datos de Supabase pequeñas/medianas ivfflat o hnsw con halfvec puede variar, usamos ivfflat por simplicidad.
-- Solo crear el índice si hay suficientes datos, de lo contrario la búsqueda exacta KNN es suficientemente rápida.
-- create index on strategy_vectors using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Función para buscar estrategias relevantes usando búsqueda por similitud (Cosine Distance)
create or replace function match_strategy_vectors (
  query_embedding vector(3072),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    strategy_vectors.id,
    strategy_vectors.content,
    strategy_vectors.metadata,
    1 - (strategy_vectors.embedding <=> query_embedding) as similarity
  from strategy_vectors
  where 1 - (strategy_vectors.embedding <=> query_embedding) > match_threshold
  order by strategy_vectors.embedding <=> query_embedding
  limit match_count;
$$;

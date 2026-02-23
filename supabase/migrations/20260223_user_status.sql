-- Migration: user_status table and status column for cards
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)

-- 1. Tabla de estado global de energía del usuario
CREATE TABLE IF NOT EXISTS user_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  current_energy INT DEFAULT 10
    CHECK (current_energy BETWEEN 1 AND 10),
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- 2. Fila inicial por defecto (se usa si no existe el user_id en el momento del lookup)
INSERT INTO user_status (user_id, current_energy)
  VALUES ('default_user', 10)
  ON CONFLICT (user_id) DO NOTHING;

-- 3. Añadir columna 'status' a la tabla cards
--    (pending / completed / blocked)
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
  CHECK (status IN ('pending', 'completed', 'blocked'));

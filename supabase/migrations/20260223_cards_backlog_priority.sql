-- =============================================================================
-- Migration: Add 'backlog' to cards.priority constraint
-- Run this in: Supabase Dashboard > SQL Editor
-- =============================================================================

-- Eliminar el constraint anterior y recrearlo con 'backlog'
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_priority_check;
ALTER TABLE cards ADD CONSTRAINT cards_priority_check
  CHECK (priority IN ('high', 'medium', 'low', 'backlog'));

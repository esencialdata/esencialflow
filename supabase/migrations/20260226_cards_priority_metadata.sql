-- =============================================================================
-- Migration: Persist strategic prioritization metadata on cards
-- =============================================================================

ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_priority_check;
ALTER TABLE cards ADD CONSTRAINT cards_priority_check
  CHECK (priority IN ('high', 'medium', 'low', 'backlog'));

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS score INT CHECK (score >= 0 AND score <= 100),
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS utility_domain TEXT;

ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_utility_domain_check;
ALTER TABLE cards ADD CONSTRAINT cards_utility_domain_check
  CHECK (utility_domain IS NULL OR utility_domain IN (
    'money',
    'client_delivery',
    'own_product',
    'personal_growth',
    'idi_creamos',
    'health_energy',
    'admin'
  ));

CREATE INDEX IF NOT EXISTS cards_score_idx ON cards (score DESC);
CREATE INDEX IF NOT EXISTS cards_project_id_idx ON cards (project_id);
CREATE INDEX IF NOT EXISTS cards_utility_domain_idx ON cards (utility_domain);

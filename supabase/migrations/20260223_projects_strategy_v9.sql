-- =============================================================================
-- Migration: projects table — Estrategia v9
-- Run this in: Supabase Dashboard > SQL Editor
-- =============================================================================

-- 1. Crear la tabla de proyectos estratégicos
CREATE TABLE IF NOT EXISTS projects (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificador canónico del proyecto (debe coincidir con project_id en tasks/cards)
  project_id            TEXT NOT NULL UNIQUE,

  -- Nombre legible del proyecto
  name                  TEXT NOT NULL,

  -- Multiplicador de leverage que se aplica al apalancamiento en la fórmula de Score
  -- Score = (fin×0.35) + (apal×0.30×leverage_multiplier) + (urg×0.15) + (vit×0.20)
  leverage_multiplier   NUMERIC(4,2) NOT NULL DEFAULT 1.0
    CHECK (leverage_multiplier BETWEEN 0.1 AND 5.0),

  -- Nivel de energía mínimo requerido para ejecutar tareas de este proyecto
  energy_req            INT NOT NULL DEFAULT 5
    CHECK (energy_req BETWEEN 1 AND 10),

  -- Dominio estratégico (de los chunks de v9)
  domain                TEXT,

  -- Foco estratégico principal
  strategic_focus       TEXT,

  -- project_id del padre (para clientes de Esencial Work, etc.)
  parent_project_id     TEXT REFERENCES projects(project_id),

  -- Si TRUE, las tareas de este proyecto quedan marcadas para revisión estratégica
  needs_strategic_review BOOLEAN NOT NULL DEFAULT FALSE,

  -- Metadata
  strategy_version      TEXT NOT NULL DEFAULT 'v9',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_projects_updated_at();

-- 3. Insertar los proyectos de la Estrategia v9
-- Nota: PRJ-NONE es el fallback obligatorio — nunca eliminar este registro.
INSERT INTO projects
  (project_id, name, leverage_multiplier, energy_req, domain, strategic_focus, parent_project_id, needs_strategic_review)
VALUES
  -- ── NIVEL MÁXIMO ──────────────────────────────────────────────────────────
  ('PRJ-VITAL',        'Mantenimiento Vital',        2.0,  1,  'project_reference', 'Salud, sueño y ejercicio',            NULL,            FALSE),

  -- ── NIVEL ALTO ────────────────────────────────────────────────────────────
  ('PRJ-MIGA',         'Proyecto MIGA (SaaS MVP)',   1.5,  9,  'project_reference', 'Ventas SaaS MVP',                     NULL,            FALSE),
  ('PRJ-CREAMOS',      'Creamos Juntos',             1.4,  5,  'project_reference', 'Marca personal y bienestar espiritual',NULL,            FALSE),
  ('PRJ-ESTUDIO',      'Estudio Coursera',           1.3,  6,  'project_reference', 'Capacitación UX y Project Management', NULL,            FALSE),

  -- ── ESENCIAL WORK (Agencia) ───────────────────────────────────────────────
  ('PRJ-ESENCIAL',     'Esencial Work (Agencia)',    1.2,  7,  'project_reference', 'Lead Generation y flujo de caja',     NULL,            FALSE),
  ('PRJ-ES-KUCHEN',    'Cliente Kuchen',             1.1,  8,  'project_reference', 'Automatización y App interna',        'PRJ-ESENCIAL',  FALSE),
  ('PRJ-ES-QUINTA',    'Cliente La Quinta',          1.0,  6,  'project_reference', 'Consultoría UX y Service Design',     'PRJ-ESENCIAL',  FALSE),
  ('PRJ-ES-QUALISTER', 'Cliente Qualister',          1.0,  7,  'project_reference', 'Optimización de procesos operativos', 'PRJ-ESENCIAL',  FALSE),
  ('PRJ-ES-CHELITO',   'Cliente Chelito de Montiel', 0.9,  5,  'project_reference', 'Marketing Digital Panadería',         'PRJ-ESENCIAL',  FALSE),

  -- ── ALIASES DE TAREAS (IDs legacy usados por la IA actualmente) ───────────
  -- Estos aliases garantizan compatibilidad sin romper nada existente.
  ('T-MIGA-05',        'MIGA [alias tarea]',         1.5,  9,  'project_reference', 'Ventas SaaS MVP',                     'PRJ-MIGA',      FALSE),
  ('T-KUCH-02',        'Kuchen [alias tarea]',        1.1,  8,  'project_reference', 'Automatización y App interna',        'PRJ-ES-KUCHEN', FALSE),
  ('T-QUAL-01',        'Qualister [alias tarea]',     1.0,  7,  'project_reference', 'Optimización de procesos operativos', 'PRJ-ES-QUALISTER', FALSE),

  -- ── FALLBACK OBLIGATORIO ──────────────────────────────────────────────────
  -- PRJ-NONE: asignado automáticamente cuando la IA no reconoce el proyecto.
  -- needs_strategic_review = TRUE dispara la bandera de revisión posterior.
  ('PRJ-NONE',         'Sin Proyecto (Fallback)',     1.0,  5,  'project_reference', 'Revisión Estratégica pendiente',      NULL,            TRUE)

ON CONFLICT (project_id) DO UPDATE SET
  name                  = EXCLUDED.name,
  leverage_multiplier   = EXCLUDED.leverage_multiplier,
  energy_req            = EXCLUDED.energy_req,
  domain                = EXCLUDED.domain,
  strategic_focus       = EXCLUDED.strategic_focus,
  parent_project_id     = EXCLUDED.parent_project_id,
  needs_strategic_review = EXCLUDED.needs_strategic_review,
  strategy_version      = EXCLUDED.strategy_version,
  updated_at            = now();

-- 4. Índice para lookups rápidos (usado por la Edge Function)
CREATE INDEX IF NOT EXISTS idx_projects_project_id ON projects(project_id);

-- 5. Verificación rápida — debe mostrar 13 filas ordenadas por leverage DESC
-- SELECT project_id, name, leverage_multiplier, energy_req, needs_strategic_review
-- FROM projects
-- ORDER BY leverage_multiplier DESC, project_id;

-- CNU-RISE Wasabi Research Coworks
-- Run this in the Vercel/Neon SQL console before using the dashboard.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS phase1_records (
  sub_id TEXT PRIMARY KEY,
  initial_weight NUMERIC,
  final_weight NUMERIC,
  multiplication_rate NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN initial_weight IS NULL OR initial_weight = 0 OR final_weight IS NULL THEN NULL
      ELSE final_weight / initial_weight
    END
  ) STORED,
  contaminated_count NUMERIC,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO phase1_records (sub_id)
SELECT 'CYCLE_' || LPAD(i::TEXT, 2, '0')
FROM generate_series(1, 5) AS i
ON CONFLICT (sub_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS samples (
  sample_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT '대기중',
  condition_no INTEGER NOT NULL,
  repeat_n INTEGER NOT NULL,
  rb_ratio TEXT NOT NULL,
  rb_red_ratio NUMERIC NOT NULL,
  rb_blue_ratio NUMERIC NOT NULL,
  fr_percent NUMERIC NOT NULL,
  ppfd_umol_m2_s NUMERIC NOT NULL,
  photoperiod_light_h INTEGER NOT NULL DEFAULT 16,
  photoperiod_dark_h INTEGER NOT NULL DEFAULT 8,
  position_index INTEGER UNIQUE,
  chamber_row INTEGER,
  chamber_col INTEGER,
  gsl_gluco_umol_g NUMERIC,
  gsl_sinigrin_umol_g NUMERIC,
  dw_g NUMERIC,
  fw_g NUMERIC,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS samples_condition_idx ON samples (condition_no, repeat_n);
CREATE INDEX IF NOT EXISTS samples_position_idx ON samples (position_index);

CREATE TABLE IF NOT EXISTS phase2_monitoring (
  id TEXT PRIMARY KEY,
  sample_id TEXT NOT NULL REFERENCES samples(sample_id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  round_label TEXT NOT NULL,
  checked_at TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT '정상',
  contamination TEXT NOT NULL DEFAULT '없음',
  monitor_fw_g NUMERIC,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sample_id, week)
);

CREATE INDEX IF NOT EXISTS phase2_monitoring_sample_week_idx
  ON phase2_monitoring (sample_id, week);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at DESC);

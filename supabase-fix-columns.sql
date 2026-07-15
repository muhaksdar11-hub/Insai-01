-- Fix missing columns that were skipped by CREATE TABLE IF NOT EXISTS

ALTER TABLE strategy_states ADD COLUMN IF NOT EXISTS state_name VARCHAR(50) DEFAULT 'IDLE';
ALTER TABLE strategy_states ADD COLUMN IF NOT EXISTS state_status VARCHAR(50) DEFAULT 'active';
ALTER TABLE strategy_states ADD COLUMN IF NOT EXISTS payload_json JSONB;
ALTER TABLE strategy_states ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE strategy_states ADD COLUMN IF NOT EXISTS signal_key VARCHAR(255);

ALTER TABLE signals ADD COLUMN IF NOT EXISTS ai_decision VARCHAR(50);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;

ALTER TABLE signal_evidence ADD COLUMN IF NOT EXISTS details JSONB;
ALTER TABLE signal_evidence ADD COLUMN IF NOT EXISTS engine_name VARCHAR(100);
ALTER TABLE signal_evidence ADD COLUMN IF NOT EXISTS evidence_type VARCHAR(50);

-- Notify PostgREST to reload the schema cache so the API recognizes the new columns
NOTIFY pgrst, 'reload schema';

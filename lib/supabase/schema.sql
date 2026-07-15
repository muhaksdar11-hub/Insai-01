-- Base extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core Tables
CREATE TABLE IF NOT EXISTS strategies (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT false,
  config JSONB,
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_key VARCHAR(255) UNIQUE NOT NULL,
  strategy_id VARCHAR(100) REFERENCES strategies(id),
  symbol VARCHAR(20) NOT NULL,
  session VARCHAR(50),
  timeframe VARCHAR(10),
  direction VARCHAR(10) NOT NULL,
  entry_price NUMERIC,
  sl_price NUMERIC,
  tp1_price NUMERIC,
  tp2_price NUMERIC,
  tp3_price NUMERIC,
  ai_decision VARCHAR(50),
  ai_reasoning TEXT,
  status VARCHAR(50) NOT NULL,
  correlation_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id VARCHAR(100) REFERENCES strategies(id),
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL,
  state_name VARCHAR(50) NOT NULL,
  state_status VARCHAR(50) NOT NULL,
  signal_key VARCHAR(255),
  payload_json JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signal_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_key VARCHAR(255) REFERENCES signals(signal_key),
  rule_id VARCHAR(100),
  engine_name VARCHAR(100),
  evidence_type VARCHAR(50),
  details JSONB,
  passed BOOLEAN,
  reason TEXT,
  payload_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL,
  close NUMERIC NOT NULL,
  high NUMERIC,
  low NUMERIC,
  open NUMERIC,
  volume NUMERIC,
  price_live NUMERIC,
  provider VARCHAR(100),
  timestamp TIMESTAMPTZ,
  indicators_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_key VARCHAR(255) REFERENCES signals(signal_key),
  strategy_id VARCHAR(100) REFERENCES strategies(id),
  symbol VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL,
  outcome VARCHAR(50),
  pips_result NUMERIC,
  rr_realized NUMERIC,
  reason TEXT,
  correlation_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ DEFAULT NOW(),
  embedding vector(768)
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50),
  severity VARCHAR(50),
  target VARCHAR(255),
  message TEXT,
  payload_json JSONB,
  status VARCHAR(50),
  alert_key VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_key VARCHAR(255),
  strategy_id VARCHAR(100),
  decision VARCHAR(50),
  reason TEXT,
  threshold_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor VARCHAR(255),
  actor_id UUID,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  payload_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(50),
  purpose TEXT,
  source_type VARCHAR(50),
  status VARCHAR(50) NOT NULL,
  health_status VARCHAR(50),
  dependency VARCHAR(100),
  fallback_status VARCHAR(50),
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  currency VARCHAR(10),
  impact VARCHAR(20),
  forecast VARCHAR(50),
  previous VARCHAR(50),
  actual VARCHAR(50),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  health_status VARCHAR(50),
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  circuit_breaker_status VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_signals_strategy_id ON signals(strategy_id);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);
CREATE INDEX IF NOT EXISTS idx_history_strategy_id ON history(strategy_id);
CREATE INDEX IF NOT EXISTS idx_history_symbol ON history(symbol);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at);
CREATE INDEX IF NOT EXISTS idx_strategy_states_strategy_id ON strategy_states(strategy_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol ON market_snapshots(symbol);

-- Enable Row Level Security
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_health ENABLE ROW LEVEL SECURITY;

-- Service Role full access policies (Engine bypasses RLS using service_role key)
DROP POLICY IF EXISTS "Service Role All Access on strategies" ON strategies;
CREATE POLICY "Service Role All Access on strategies" ON strategies FOR ALL USING (true);
DROP POLICY IF EXISTS "Service Role All Access on strategy_states" ON strategy_states;
CREATE POLICY "Service Role All Access on strategy_states" ON strategy_states FOR ALL USING (true);
DROP POLICY IF EXISTS "Service Role All Access on signals" ON signals;
CREATE POLICY "Service Role All Access on signals" ON signals FOR ALL USING (true);
DROP POLICY IF EXISTS "Service Role All Access on history" ON history;
CREATE POLICY "Service Role All Access on history" ON history FOR ALL USING (true);
DROP POLICY IF EXISTS "Service Role All Access on market_snapshots" ON market_snapshots;
CREATE POLICY "Service Role All Access on market_snapshots" ON market_snapshots FOR ALL USING (true);
DROP POLICY IF EXISTS "Service Role All Access on news_events" ON news_events;
CREATE POLICY "Service Role All Access on news_events" ON news_events FOR ALL USING (true);
DROP POLICY IF EXISTS "Service Role All Access on mcp_services" ON mcp_services;
CREATE POLICY "Service Role All Access on mcp_services" ON mcp_services FOR ALL USING (true);
DROP POLICY IF EXISTS "Service Role All Access on alerts" ON alerts;
CREATE POLICY "Service Role All Access on alerts" ON alerts FOR ALL USING (true);
DROP POLICY IF EXISTS "Service Role All Access on audit_logs" ON audit_logs;
CREATE POLICY "Service Role All Access on audit_logs" ON audit_logs FOR ALL USING (true);
DROP POLICY IF EXISTS "Service Role All Access on signal_evidence" ON signal_evidence;
CREATE POLICY "Service Role All Access on signal_evidence" ON signal_evidence FOR ALL USING (true);
DROP POLICY IF EXISTS "Service Role All Access on risk_events" ON risk_events;
CREATE POLICY "Service Role All Access on risk_events" ON risk_events FOR ALL USING (true);
DROP POLICY IF EXISTS "Service Role All Access on provider_health" ON provider_health;
CREATE POLICY "Service Role All Access on provider_health" ON provider_health FOR ALL USING (true);

-- Added Constraints from PRD
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_strategy_status') THEN
    ALTER TABLE strategies ADD CONSTRAINT chk_strategy_status CHECK (status IN ('active', 'inactive', 'testing', 'archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_signal_status') THEN
    ALTER TABLE signals ADD CONSTRAINT chk_signal_status CHECK (status IN ('PENDING', 'ACTIVE', 'SIGNAL_ACTIVE', 'TAKE_PARTIAL', 'FINISHED', 'REJECTED', 'EXPIRED', 'SUPPRESSED', 'WAIT_AI', 'WAIT_RETEST', 'WAIT_CONFIRMATION', 'WAIT_NECKLINE_BREAK', 'WAIT_NEWS', 'APPROVED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_history_status') THEN
    ALTER TABLE history ADD CONSTRAINT chk_history_status CHECK (status IN ('FINISHED', 'REJECTED', 'EXPIRED', 'SUPPRESSED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_history_outcome') THEN
    ALTER TABLE history ADD CONSTRAINT chk_history_outcome CHECK (outcome IN ('WIN', 'LOSS', 'BREAK_EVEN', 'UNKNOWN'));
  END IF;
END $$;

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_history_signals (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  signal_key varchar,
  strategy_id varchar,
  symbol varchar,
  outcome varchar,
  pips_result numeric,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    history.id,
    history.signal_key,
    history.strategy_id,
    history.symbol,
    history.outcome,
    history.pips_result,
    1 - (history.embedding <=> query_embedding) AS similarity
  FROM history
  WHERE history.embedding IS NOT NULL AND 1 - (history.embedding <=> query_embedding) > match_threshold
  ORDER BY history.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

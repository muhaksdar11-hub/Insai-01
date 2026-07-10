-- 1. Pastikan kolom 'config' ada di tabel strategies
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='strategies' AND column_name='config') THEN
    ALTER TABLE strategies ADD COLUMN config JSONB;
  END IF;
END $$;

-- 2. Pastikan tabel mcp_services memiliki constraint UNIQUE untuk 'name' agar seed bisa berjalan
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'mcp_services'::regclass AND contype = 'u' 
        AND conname = 'mcp_services_name_key'
    ) THEN
        ALTER TABLE mcp_services ADD CONSTRAINT mcp_services_name_key UNIQUE(name);
    END IF;
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. Memasukkan data strategies (Seed Strategies)
INSERT INTO strategies (id, name, description, status, enabled, config) VALUES
('strategy-1', 'SMC + London Session + M15', 'Smart Money Concepts during London Open', 'active', true, '{"timeframe": "15min"}'),
('strategy-2', 'Supply & Demand + Engulfing', 'S&D zones with Engulfing confirmation', 'active', true, '{"timeframe": "1h"}'),
('strategy-3', 'Scalping SMC + Liquidity Sweep', 'Scalping with Liquidity Sweeps on M5', 'active', true, '{"timeframe": "5min"}'),
('strategy-4', 'News XAUUSD Reversal', 'High Impact News Reversal Strategy', 'active', true, '{"timeframe": "1min"}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, config = EXCLUDED.config;

-- 4. Memasukkan data MCP services (Seed MCP Services)
INSERT INTO mcp_services (name, category, purpose, source_type, status, health_status) VALUES
('TwelveData', 'MarketData', 'Real-time XAUUSD price & indicators', 'REST', 'active', 'healthy'),
('YahooFinance', 'MarketData', 'Fallback market data source', 'REST', 'inactive', 'unknown'),
('NewsAPI', 'News', 'Global financial news', 'REST', 'active', 'healthy'),
('ForexFactory', 'News', 'Forex economic calendar', 'Scraper', 'active', 'healthy')
ON CONFLICT (name) DO UPDATE SET purpose = EXCLUDED.purpose;


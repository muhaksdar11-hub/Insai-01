INSERT INTO strategies (id, name, description, status, enabled, config) VALUES
('strategy-1', 'SMC + London Session + M15', 'Smart Money Concepts during London Open', 'active', true, '{"timeframe": "15min"}'),
('strategy-2', 'Supply & Demand + Engulfing', 'S&D zones with Engulfing confirmation', 'active', true, '{"timeframe": "1h"}'),
('strategy-3', 'Scalping SMC + Liquidity Sweep', 'Scalping with Liquidity Sweeps on M5', 'active', true, '{"timeframe": "5min"}'),
('strategy-4', 'News XAUUSD Reversal', 'High Impact News Reversal Strategy', 'active', true, '{"timeframe": "1min"}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

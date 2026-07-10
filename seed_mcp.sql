INSERT INTO mcp_services (name, category, purpose, source_type, status, health_status) VALUES
('TwelveData', 'MarketData', 'Real-time XAUUSD price & indicators', 'REST', 'active', 'healthy'),
('YahooFinance', 'MarketData', 'Fallback market data source', 'REST', 'inactive', 'unknown'),
('NewsAPI', 'News', 'Global financial news', 'REST', 'active', 'healthy'),
('ForexFactory', 'News', 'Forex economic calendar', 'Scraper', 'active', 'healthy')
ON CONFLICT (name) DO NOTHING;

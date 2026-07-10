const fs = require('fs');
let sql = fs.readFileSync('lib/supabase/schema.sql', 'utf8');

// add config to strategies
sql = sql.replace(/enabled BOOLEAN DEFAULT false,/g, 'enabled BOOLEAN DEFAULT false,\n  config JSONB,');

// add UNIQUE(name) to mcp_services
sql = sql.replace(/updated_at TIMESTAMPTZ DEFAULT NOW\(\)\n\);/g, 'updated_at TIMESTAMPTZ DEFAULT NOW(),\n  UNIQUE(name)\n);');

fs.writeFileSync('lib/supabase/schema.sql', sql);

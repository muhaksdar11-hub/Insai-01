const fs = require('fs');
let sql = fs.readFileSync('lib/supabase/schema.sql', 'utf8');

// Replace CREATE POLICY with DROP POLICY IF EXISTS ... then CREATE POLICY
sql = sql.replace(/CREATE POLICY "([^"]+)" ON ([a-zA-Z0-9_]+) FOR ALL USING \(true\);/g, 'DROP POLICY IF EXISTS "$1" ON $2;\nCREATE POLICY "$1" ON $2 FOR ALL USING (true);');

// Wrap constraints in a DO block to avoid errors
const constraintsStart = sql.indexOf('-- Added Constraints from PRD');
if (constraintsStart !== -1) {
  let beforeConstraints = sql.slice(0, constraintsStart);
  let newConstraints = `-- Added Constraints from PRD
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_strategy_status') THEN
    ALTER TABLE strategies ADD CONSTRAINT chk_strategy_status CHECK (status IN ('active', 'inactive', 'testing', 'archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_signal_status') THEN
    ALTER TABLE signals ADD CONSTRAINT chk_signal_status CHECK (status IN ('PENDING', 'ACTIVE', 'FINISHED', 'REJECTED', 'EXPIRED', 'WAIT_AI', 'WAIT_RETEST', 'WAIT_CONFIRMATION', 'WAIT_NECKLINE_BREAK', 'WAIT_NEWS', 'APPROVED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_history_status') THEN
    ALTER TABLE history ADD CONSTRAINT chk_history_status CHECK (status IN ('FINISHED', 'REJECTED', 'EXPIRED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_history_outcome') THEN
    ALTER TABLE history ADD CONSTRAINT chk_history_outcome CHECK (outcome IN ('WIN', 'LOSS', 'BREAK_EVEN', 'UNKNOWN'));
  END IF;
END $$;
`;
  sql = beforeConstraints + newConstraints;
}

fs.writeFileSync('lib/supabase/schema.sql', sql);

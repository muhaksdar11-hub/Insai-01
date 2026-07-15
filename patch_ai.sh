#!/bin/bash
cat << 'INNER_EOF' > patch.js
const fs = require('fs');
const file = 'lib/trading-engine/validation-pipeline/ai-orchestrator.ts';
let code = fs.readFileSync(file, 'utf8');

const importSupabase = "import { getSupabaseClient } from '../../supabase/client';\n";
if (!code.includes("import { getSupabaseClient }")) {
    code = code.replace("import { getEnv } from '../../utils/env';", "import { getEnv } from '../../utils/env';\n" + importSupabase);
}

const ragCode = `
      // --- RAG IMPLEMENTATION ---
      let similarHistoryText = "No historical context available.";
      try {
          const stateSummary = \`Strategy: \${strategyId}, Timeframe: \${state.timeframe}, Symbol: \${state.symbol}, Rules: \${simplifiedResults.map(r => r.rule + "=" + r.status).join(',')}\`;
          
          const embedRes = await aiClient.models.embedContent({
              model: 'text-embedding-004',
              contents: stateSummary
          });
          
          const embedding = embedRes.embeddings?.[0]?.values;
          
          if (embedding && embedding.length > 0) {
              const supabase = getSupabaseClient();
              const similarSignals = await supabase.findSimilarHistory(embedding, 0.7, 5);
              if (similarSignals && similarSignals.length > 0) {
                  const winCount = similarSignals.filter((s: any) => s.outcome === 'WIN').length;
                  const lossCount = similarSignals.filter((s: any) => s.outcome === 'LOSS').length;
                  similarHistoryText = \`Found \${similarSignals.length} similar historical signals (Win: \${winCount}, Loss: \${lossCount}). \` +
                     similarSignals.map((s: any) => \`[\${s.outcome}] Pips: \${s.pips_result || 0} | Strategy: \${s.strategy_id} | Similarity: \${(s.similarity * 100).toFixed(1)}%\`).join('\\n');
              }
          }
      } catch (e: any) {
          logger.warn('Failed to retrieve RAG context', { error: e.message });
      }
      // --------------------------
`;

code = code.replace("const prompt = `INSAI Analyst", ragCode + "\n      let prompt = `INSAI Analyst");

// Now we need to append the similar history text to the prompt
code = code.replace("Konteks: ${JSON.stringify(marketContext)}`", "Konteks: ${JSON.stringify(marketContext)}\n\nHISTORICAL CONTEXT (RAG):\n${similarHistoryText}`");

fs.writeFileSync(file, code);
INNER_EOF
node patch.js && rm patch.js patch_ai.sh
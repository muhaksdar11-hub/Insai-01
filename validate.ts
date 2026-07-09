async function main() {
    try {
        console.log("=== RUNNING FULL SYSTEM VALIDATION ===");
        
        console.log("\n1. Testing Next.js API & Internal Node.js Health...");
        const healthRes = await fetch("http://localhost:3000/api/system/health");
        if (healthRes.ok) {
            const health = await healthRes.json();
            console.log("Health API: OK");
            for (const s of health.data.services) {
                console.log(`- ${s.name}: ${s.status} ${s.message ? '('+s.message+')' : ''}`);
            }
        } else {
            console.log(`Health API: Failed with status ${healthRes.status}`);
        }

        console.log("\n2. Testing MCP Backend Connections (TwelveData, Supabase, Gemini, etc)...");
        const mcpRes = await fetch("http://localhost:3000/api/mcp/status");
        if (mcpRes.ok) {
            const mcp = await mcpRes.json();
            console.log("MCP Status API: OK");
            for (const s of mcp.data) {
                if (s.status !== 'active' && s.sourceType !== 'Internal') {
                   console.log(`- ${s.name}: ${s.status} (Error: ${s.lastError || s.notes || ''})`);
                } else if (s.sourceType !== 'Internal') {
                   console.log(`- ${s.name}: ${s.status}`);
                }
            }
        } else {
            console.log(`MCP Status API: Failed with status ${mcpRes.status}`);
        }
        
    } catch (e: any) {
        console.log("Error running validation:", e.message);
    }
}

main();

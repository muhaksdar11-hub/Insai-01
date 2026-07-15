import { describe, it, expect } from 'vitest';

describe('Integration Tests - API Routes', () => {
  it('should return health status', async () => {
    // A simple test calling the exported GET function directly
    const { GET } = await import('@/app/api/system/health/route');
    const response = await GET(new Request('http://localhost/api/system/health'));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBeDefined();
    expect(Array.isArray(data.data.services)).toBe(true);
  });

  it('should return MCP status honesty', async () => {
    const { GET } = await import('@/app/api/mcp/status/route');
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    
    // Ensure honesty: fake/unused engines like Weekly Risk Engine shouldn't be 'active'
    // They have been removed, so checking they don't exist
    const hasWeeklyRisk = data.data.some((m: any) => m.name === 'Weekly Risk Engine');
    expect(hasWeeklyRisk).toBe(false);
  });
});

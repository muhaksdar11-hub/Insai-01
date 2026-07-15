# AI Studio Trading Applet

A real-time, robust trading engine applet. This system features real data fetching from TwelveData (and Polygon.io fallback), local Python engines for AI operations, Supabase for state management, and Redis for queues and deduplication.

## Features

- **Full-Stack Next.js 15+ App Router**: Powers the user interface and the primary routing mechanisms.
- **Python Backend Engine**: A FastAPI local service (`python-engine`) optimized for running math-intensive AI operations or indicators.
- **Durable Persistence**: Built on Supabase for signal history, states, auditing, and market snapshots.
- **Market Data Pipelines**: Integrates with external APIs (TwelveData, NFS Economic Calendar) in real time.
- **MCP Integration & AI Orchestrator**: Uses Gemini AI via MCP patterns to generate reasoned decisions on trade signals.
- **Health Checks & Circuit Breaking**: Robust fault-tolerant architecture handling dependency downtimes without crash-looping.

## Prerequisites

1. **Node.js 22+**
2. **Python 3.11+**
3. **Supabase & Redis**: Required for distributed queue, state persistence, and audit logging.

## Installation & Setup

1. **Clone & Install Dependencies**
   ```bash
   # Install Node dependencies
   npm ci --no-audit --prefer-offline

   # Install Python dependencies
   python3 -m venv venv
   source venv/bin/activate
   pip install -r python-engine/requirements.txt
   ```

2. **Environment Variables**
   Copy `.env.example` to `.env` and fill in the necessary keys.
   ```bash
   cp .env.example .env
   ```

3. **Database Migration**
   Execute `lib/supabase/schema.sql` against your Supabase SQL editor to create the required tables.

4. **Run Development Server**
   ```bash
   npm run dev
   ```
   *Note: This command will automatically spawn the Python engine locally unless `PYTHON_ENGINE_URL` is explicitly overridden.*

## Deployment
Built and configured to run securely via **Nixpacks** on Railway. `railway.json` and `nixpacks.toml` encapsulate the required build steps automatically.

```bash
npm run build
npm run start
```

*Note: This repository contains no dummy logic, mock datasets, or "AI slop" data. All components are built for production-readiness, requiring valid credentials to function correctly.*

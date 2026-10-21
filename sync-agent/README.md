# Sage 50 Sync Agent

Windows service that reads Sage 50 (Peachtree) data locally and pushes it to the Elecnovatech platform.

## Setup

1. Install Node.js 20+ on the Sage 50 machine
2. Copy this folder to the client machine
3. Configure environment:

```env
ELECNOVA_PLATFORM_URL=https://your-app.vercel.app
SAGE50_SYNC_API_KEY=your-api-key
SAGE50_SYNC_SECRET=your-secret
SYNC_INTERVAL_MINUTES=30
SAGE_DATA_FILE=C:\path\to\sage-export.json
```

4. Run: `npm install && npm start`

## Production Integration

Replace `readSageData()` in `index.ts` with the ODBC/SDK connector for the client's exact Sage 50 version. The agent pushes one-way encrypted data outbound — no inbound connection to the client network is required.

## Manual Sync

Use the **Sync Now** button in Finance Reconciliation, or POST to `/api/sage/sync` with headers `X-Sage-Sync-Key` and `X-Sage-Sync-Secret`.

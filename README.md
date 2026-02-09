# Flux

Self-hosted Discord-like app with voice chat, text chat, and (soon) E2E encryption.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+

## Quick Start (Local Dev)

```bash
# 1. Install dependencies
pnpm install

# 2. Build shared types
pnpm build:shared

# 3. Set up environment
cp packages/server/.env.example packages/server/.env
# Edit .env if needed (defaults work for local dev)

# 4. Download LiveKit server binary
# Go to https://github.com/livekit/livekit/releases
# Download livekit_X.X.X_windows_amd64.zip (or your OS)
# Extract livekit-server.exe into the bin/ folder at the repo root

# 5. Start all three services (each in its own terminal):

# Terminal 1 - LiveKit server (skip if using LiveKit Cloud)
bin\livekit-server.exe --config livekit.yaml --dev --bind 0.0.0.0

# Terminal 2 - Flux backend
pnpm dev:server

# Terminal 3 - Flux frontend
pnpm dev:client
```

Open http://localhost:5173, register an account, create a server, and you're in.

---

## Host a Server for Friends (Remote Access)

To let a friend on a different network join your server, you need two things:

1. **[ngrok](https://ngrok.com/)** - tunnels your web app to a public URL (free)
2. **[LiveKit Cloud](https://cloud.livekit.io/)** - handles voice chat networking (free tier)

### Step 1: Set Up LiveKit Cloud

LiveKit Cloud handles all the WebRTC/UDP complexity so you don't need to forward ports.

1. Go to https://cloud.livekit.io/ and create a free account
2. Create a new project
3. Go to **Settings > Keys** and copy your **API Key**, **API Secret**, and **WebSocket URL**
4. Update `packages/server/.env`:
   ```
   LIVEKIT_API_KEY=your_cloud_api_key
   LIVEKIT_API_SECRET=your_cloud_api_secret
   LIVEKIT_URL=wss://your-project.livekit.cloud
   ```

With LiveKit Cloud, you do **NOT** need to run `livekit-server.exe` locally.

### Step 2: Set Up ngrok

ngrok gives your local Flux app a public HTTPS URL. The Vite dev server proxies all API and WebSocket traffic to the backend, so one tunnel is all you need.

1. Install ngrok: https://ngrok.com/download
2. Sign up and authenticate: `ngrok config add-authtoken YOUR_TOKEN`
3. Start the Flux backend and frontend as usual (Terminals 2 and 3 from Quick Start)
4. In a new terminal, start the tunnel:
   ```bash
   ngrok http 5173
   ```
5. ngrok will show a public URL like `https://abc123.ngrok-free.app`
6. Share that URL with your friend

### Step 3: Your Friend Joins

Your friend just needs a browser:

1. Open the ngrok URL you shared
2. Register a new account
3. You share your server's invite code (click the server icon to see it)
4. They join via the invite code
5. Click a voice channel and hit "Join Voice Channel"

### Troubleshooting

- **ngrok "Visit Site" interstitial**: Free ngrok shows a warning page on first visit. Your friend clicks through it once.
- **Voice not connecting**: Make sure you updated `.env` with LiveKit Cloud credentials and restarted the server (`pnpm dev:server`).
- **WebSocket disconnects**: If the ngrok tunnel restarts, the URL changes. Share the new URL.

---

## Project Structure

```
flux/
  packages/
    shared/     # Types, constants, validators
    server/     # Fastify backend + WebSocket gateway
    client/     # React frontend (Vite)
  bin/          # LiveKit server binary (not committed)
  livekit.yaml  # LiveKit local dev config
```

## Tech Stack

- **Frontend:** React + TypeScript + Zustand
- **Backend:** Fastify + SQLite + Better Auth + Drizzle ORM
- **Voice:** LiveKit (self-hosted or cloud SFU)
- **Real-time:** WebSocket via @fastify/websocket

## Environment Variables

See `packages/server/.env.example`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend port |
| `BETTER_AUTH_SECRET` | (required) | Random auth secret |
| `LIVEKIT_API_KEY` | `devkey` | LiveKit API key |
| `LIVEKIT_API_SECRET` | `secret` | LiveKit API secret |
| `LIVEKIT_URL` | `ws://localhost:7880` | LiveKit WebSocket URL |

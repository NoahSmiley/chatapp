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

# Terminal 3 - Flux desktop app
pnpm dev:electron
```

The Flux desktop app will open. Register an account, create a server, and you're in.

---

## Host a Server for Friends (Remote Access)

Your friend clones the repo, runs the app locally, and connects to your backend. Voice chat goes through LiveKit Cloud — no UDP port forwarding needed.

### What You (Host) Need

1. **Port forward TCP port 3001** on your router to your PC's local IP
2. **[LiveKit Cloud](https://cloud.livekit.io/)** account (free tier) for voice chat

### Step 1: Set Up LiveKit Cloud

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

### Step 2: Port Forward & Start the Server

1. Log into your router and forward **TCP port 3001** to your PC's local IP address
2. Find your public IP (search "what is my ip")
3. Start the backend:
   ```bash
   pnpm dev:server
   ```
4. Launch the desktop app:
   ```bash
   pnpm dev:electron
   ```

### Step 3: Your Friend Joins

Your friend needs [Node.js](https://nodejs.org/) v20+ and [pnpm](https://pnpm.io/) v9+. Then:

```bash
# 1. Clone the repo
git clone https://github.com/NoahSmiley/chatapp.git
cd chatapp

# 2. Install and build
pnpm install
pnpm build:shared

# 3. Launch the app (replace YOUR_FRIENDS_IP with your public IP)
set BACKEND_URL=http://YOUR_FRIENDS_IP:3001 && pnpm dev:electron
```

On Mac/Linux, use `export` instead of `set`:
```bash
BACKEND_URL=http://YOUR_FRIENDS_IP:3001 pnpm dev:electron
```

The desktop app will open. Your friend:
1. Registers a new account
2. You share your server's invite code (click the server icon to see it)
3. They join via the invite code
4. Click a voice channel and hit "Join Voice Channel"

### Troubleshooting

- **Voice not connecting**: Make sure you updated `.env` with LiveKit Cloud credentials and restarted the server (`pnpm dev:server`).
- **Can't reach backend**: Verify port 3001 is forwarded on your router and your firewall allows it.
- **App won't start**: Make sure you ran `pnpm build:shared` before launching.

---

## Project Structure

```
flux/
  packages/
    shared/     # Types, constants, validators
    server/     # Fastify backend + WebSocket gateway
    client/     # Electron + React desktop app (Vite)
  bin/          # LiveKit server binary (not committed)
  livekit.yaml  # LiveKit local dev config
```

## Tech Stack

- **Desktop:** Electron + React + TypeScript + Zustand
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

**Client environment variables** (set before running `pnpm dev:electron`):

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://localhost:3001` | Backend server URL (set to host's public IP for remote play) |

# Deploying to a single AWS EC2 instance

This app is self-contained: one Node process serves the built client **and** the
WebSocket game server on a single port. No CloudFront, no Redis, no load
balancer — just one EC2 box.

## 1. Launch the instance

- AMI: Amazon Linux 2023 (or Ubuntu 22.04). A `t4g.small`/`t3.small` is plenty.
- Allocate an **Elastic IP** and associate it (so the address survives reboots).
- **Security group** inbound rules:
  - `22` (SSH) — your IP only
  - `80` (HTTP) — `0.0.0.0/0`
  - `443` (HTTPS/WSS) — `0.0.0.0/0`

## 2. Install Node 20+

```bash
# Amazon Linux 2023
sudo dnf install -y nodejs git   # if too old, use the NodeSource repo for 20.x
node -v                          # expect v20+ (v22 recommended)
```

## 3. Get the code and build

```bash
git clone <your-repo> dragonboat && cd dragonboat   # or scp the folder up
npm ci
npm run build      # type-checks and produces dist/ (the static client)
```

## 4. Run it as a service (systemd)

The server reads `PORT` (default 3000). We'll keep it on 3000 and put TLS in
front of it. Create `/etc/systemd/system/dragonboat.service`:

```ini
[Unit]
Description=Dragon Boat Race server
After=network.target

[Service]
WorkingDirectory=/home/ec2-user/dragonboat
ExecStart=/usr/bin/npm start
Environment=PORT=3000
Restart=always
User=ec2-user

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dragonboat
sudo systemctl status dragonboat        # should be active; serves on :3000
```

`npm start` runs the server with `tsx` (no separate compile step). The server
serves `dist/` for all routes and upgrades `/ws` to the game socket.

## 5. TLS — required for `wss://`

A browser on `https://` can only open a **secure** WebSocket (`wss://`). The
easiest way to get HTTPS + automatic WebSocket proxying is **Caddy**, which also
fetches and renews a free Let's Encrypt certificate.

First point a DNS record at the Elastic IP (Route 53 A record, e.g.
`race.example.com`). Then:

```bash
# Amazon Linux 2023
sudo dnf install -y caddy        # or follow caddyserver.com install docs
```

`/etc/caddy/Caddyfile`:

```
race.example.com {
    reverse_proxy localhost:3000   # Caddy proxies HTTP and WebSocket upgrades
}
```

```bash
sudo systemctl enable --now caddy
```

That's it — visit `https://race.example.com`. The client connects to
`wss://race.example.com/ws`, Caddy terminates TLS and forwards to the Node
server on 3000.

### Quick test without a domain/TLS

For a throwaway test you can skip Caddy and run the Node server directly on
port 80 (`Environment=PORT=80`, and add the `CAP_NET_BIND_SERVICE` capability or
run via Caddy). Plain `ws://` works over `http://`, so a bare
`http://<elastic-ip>/` will function — just not suitable for production.

## Updating

```bash
cd ~/dragonboat && git pull && npm ci && npm run build
sudo systemctl restart dragonboat
```

## Notes / limits of a single instance

- All race state lives in this process's memory. A restart drops any in-progress
  race (players simply reconnect into the next one).
- One box handles many simultaneous races' worth of players comfortably; if you
  ever outgrow it, that's when the ElastiCache (Redis) + multi-node path from the
  architecture discussion comes in.

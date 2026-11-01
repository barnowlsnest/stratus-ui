# stratus-ui

Web console for [Stratus](https://github.com/barnowlsnest/stratus) streams: browse records, live tail, append, delete and reconcile. It talks gRPC to a Stratus server through [`ts-stratus`](https://github.com/barnowlsnest/ts-stratus), from the Next.js server only.

## Security: run it on localhost only

**The console has no authentication.** Anyone who can reach its port can read streams, append, delete and reconcile, manage saved connections, and use the bearer tokens stored on the server. Do not expose it on a network.

- Bind it to the loopback interface when running the image (see below).
- If you need remote access, put it behind something that authenticates (an SSH tunnel, a VPN, or an authenticating reverse proxy) rather than publishing the port.
- Only the console's own pages can call its API. Requests from other websites and requests for any other hostname get a 403, because a page open in your browser can reach localhost. Behind a reverse proxy or a custom hostname, list the hostnames in `STRATUS_UI_ALLOWED_HOSTS`.
- Saved connections, including tokens, are written in plain text to `.data/connections.json` (mode 0600).

## Development

Requires Node 24.21.0 or newer (`nvm use` reads `.nvmrc`).

```bash
npm ci
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

## Docker

```bash
docker build -t stratus-ui .

docker run --rm \
  -p 127.0.0.1:3000:3000 \
  -v stratus-ui-data:/app/.data \
  -e STRATUS_ADDR=host.docker.internal:8000 \
  stratus-ui
```

`-p 127.0.0.1:3000:3000` is what keeps the console reachable from this machine only. A bare `-p 3000:3000` publishes it on every interface.

| Variable | Purpose |
| --- | --- |
| `STRATUS_ADDR` | Address of the default connection (default `localhost:8000`). Inside a container, `localhost` is the container itself; use `host.docker.internal` for a server on the host. |
| `STRATUS_TOKEN` | Bearer token for the default connection. |
| `STRATUS_UI_ALLOWED_HOSTS` | Comma-separated hostnames allowed besides `localhost`, `127.0.0.1` and `[::1]`. |

The default connection is only created on first start. Connections you add in the UI persist in the `/app/.data` volume.

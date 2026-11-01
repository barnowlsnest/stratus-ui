# CLAUDE.md

Guidance for working in this repo. Read `AGENTS.md` too: this Next.js version differs from older ones, and its docs are in `node_modules/next/dist/docs/`.

**Keep this file and `README.md` matching the code.** Update them in the same change as any behavior change. When docs and the server disagree, measure the server and document what it does.

## What this is

A Next.js console for Stratus streams. Browsers call the route handlers in `src/app/api`, which call Stratus over gRPC through `ts-stratus`. gRPC runs on the Next.js server only.

## Commands

```bash
nvm use                # Node >=24.21.0, from .nvmrc
npm ci
npm run dev
npm run typecheck      # the only automated check in the repo; there is no test suite
npm run build
docker build -t stratus-ui .
```

If Tailwind reports a missing native binding, run `rm -rf node_modules .next && npm ci` under the right Node version.

CI is `.github/workflows/ci.yml`: `npm ci`, typecheck and build on the Node version in `.nvmrc`, plus a Docker image build that is not pushed. It runs on pull requests and pushes to `main`, and has no Stratus server. Actions are pinned to commit SHAs, so bump the SHA and its version comment together.

## Layout

- `src/proxy.ts`: guards `/api`. Allows only loopback hostnames plus `STRATUS_UI_ALLOWED_HOSTS`, refuses cross-site requests, and requires JSON on POST. The console has no login, so this is what stops other websites using it.
- `src/app/api/*`: route handlers. `tail` streams server-sent events and pulls one record at a time, so a slow client does not grow a queue.
- `src/lib/server/stratus.ts`: the only module that talks to `ts-stratus`. Caches one client per connection, converts uint64 to numbers (refusing anything above 2^53), and maps gRPC errors to `StratusError`.
- `src/lib/server/connections.ts`: saved connections in `.data/connections.json`. All writes go through one in-process queue, so this assumes a single server process.
- `src/lib/server/body.ts`: bounded JSON body reader. Use it for any new route that reads a body.
- `src/components/stratus-provider.tsx`: the active connection and stream info. Only the latest reload may change state.
- `src/lib/types.ts`: types shared by server and browser.

## Things that are easy to get wrong

- **Connection lookup:** `getConnection` is exact. `resolveConnection` falls back to the first saved server and is only for a missing or stale cookie. A request with no cookie and no `?conn=` uses the first saved server, so a test that writes must pass `?conn=<id>`.
- **Stratus behavior:** `Delete` keeps the record at `end_id`. `ReadOffset` stops one record short when it catches up with the tail and sends nothing for a max of 1, so `openTail` asks for one more and stops at the limit.
- **Tail errors:** `EventSource` cannot read a failed response, so errors before the stream starts go out as an SSE `error` event when the client accepts `text/event-stream`, and as JSON otherwise.
- **Proxy body limit:** proxy buffers bodies and cuts them at `experimental.proxyClientMaxBodySize`. Keep it above the 12 MiB limit in `/api/ops`, or that route cannot answer 413.
- **Standalone builds:** `next build` recreates `.next/standalone`, including its `.data`. To run it outside Docker, copy `.next/static` to `.next/standalone/.next/static` first. The process renames itself `next-server`, so find it by port to stop it.

## Testing against Stratus

Never write to a real server to test. Start a throwaway one and name it explicitly with `?conn=<id>`:

```bash
docker run -d --rm --name stratus-scratch -e WAL_DIR=/usr/wal -e HOST=0.0.0.0 \
  -p 127.0.0.1:8001:8000 barnowlsnest/stratus:latest
```

## Dependency

`ts-stratus` is pinned to a commit in `package.json`. Bump it deliberately, and refresh the lockfile with it.

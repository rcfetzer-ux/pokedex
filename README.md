# Pokedex

Scan, catalog and value-track Pokémon cards across every set — on desktop and
mobile, from one codebase.

- **Scan** a card with the camera, a photo, or by typing what it says, and match
  it against the full catalog.
- **Catalog** your collection with printing, condition and grade, and see what
  it is worth.
- **Track live market value**, with price history per card and printing.
- **Get notified** when a card you own swings sharply — push on mobile, and an
  in-app feed everywhere.
- **Watch the market** for cards you *don't* own that moved hard in the last
  24 hours.

## Quick start

```bash
npm install
npm run build          # shared + server
npm run seed -w @pokedex/server -- --reset   # demo data, no network needed
npm run server         # API on http://localhost:4000
```

Then pick a client:

```bash
npm run app       # Expo: press w for web, i for iOS, a for Android
npm run desktop   # Electron desktop app
```

The seed uses the offline fixture provider, so the whole thing runs with no API
key and no network: a catalog spanning eight real sets, three weeks of hourly
price history, a sample collection, and the alerts that history implies.

## Going live

The offline provider is the default so the app runs anywhere. To track real
prices, switch to [pokemontcg.io](https://pokemontcg.io) — it covers every
English set and carries TCGplayer market prices.

```bash
export PRICE_PROVIDER=pokemontcgio
export POKEMONTCG_API_KEY=your-key   # optional, but the free tier is throttled hard

npm run sync -w @pokedex/server      # import every set and card (a few minutes)
npm run server                       # refreshes prices hourly from here on
```

You can also do the import from inside the app: a fresh install shows a
"Set up your card catalog" screen with an import button.

### Other providers

Everything price-related sits behind one interface (`CardDataProvider` in
`packages/server/src/providers/types.ts`) with two methods: `listSets` and
`listCards`. Adding TCGplayer's partner API, Cardmarket or eBay sold listings
means writing one class and registering it in `providers/index.ts` — nothing
downstream knows which feed it is reading.

## Deploying

The API can serve the web build itself, so a deployment is **one process on one
origin** — no CORS, no mixed-content problems, and one URL for phone, desktop
and browser.

```bash
fly launch --no-deploy --copy-config
fly volumes create pokedex_data --size 1
fly secrets set API_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
fly deploy
```

Open the URL, paste the token when prompted, import the catalog, done. The
token is stored on the device, so it is asked for once.

`Dockerfile` and `fly.toml` are in the repo; the image is plain Docker, so
Railway, Render, a VPS or anything else that runs a container works the same
way. Set `WEB_ROOT` to the exported web build and the server picks it up.

**The volume is not optional.** SQLite holds the price history, and no provider
sells history back — losing that volume means every recorded swing is gone
permanently, and the app needs another 24 hours before it can report a daily
change again.

### Authentication

Every `/api` route requires a token when `API_TOKEN` is set — sent as
`Authorization: Bearer <token>` or `X-Api-Key`. `/api/health` stays open so
health checks work without a credential.

The rules are deliberately asymmetric:

- **Local development**: no token needed. The server binds `0.0.0.0` so a phone
  on the same Wi-Fi can reach it, and it warns at boot that anyone on your
  network can read and modify your collection.
- **Production** (`NODE_ENV=production`): the server **refuses to start**
  without `API_TOKEN`. There is no way to accidentally deploy an open API that
  would let a stranger empty your collection.

One shared token rather than user accounts, because this is one person's
collection on their own server. If you ever share it, that assumption is the
first thing to revisit.

### Why not GitHub Pages

Pages serves static files, and the frontend is static — but the API is a
long-running Node process with SQLite and an hourly refresh job, and Pages runs
no code. You would still need a host for the API, plus subpath configuration, a
404.html routing fallback, and an HTTPS API to avoid mixed-content blocking.
Single-host deployment avoids all four.

## How value tracking works

**Prices are snapshotted, not fetched on demand.** No free feed sells price
history, so the server records its own: every refresh appends a row per card
and printing to `price_snapshots`, and that table is what every change, chart
and alert is computed from.

The practical consequence is that **a fresh install cannot report a 24h change
until it has been running for 24 hours.** The app says so explicitly rather
than showing an empty list that looks like "nothing moved". Seed the demo data
if you want to see the feature working immediately.

**"Major swing" is judged on both percent and dollars.** Percent alone is the
obvious approach and it is wrong for this market:

- A bulk common drifting from $0.03 to $0.09 is +200% and means nothing.
- A chase card moving $1,800 → $1,950 is +8.3% and is real news.

So a move is rated on percentage *and* on absolute size, takes the higher of the
two, and is suppressed entirely below a dollar floor. See
`packages/shared/src/swings.ts`; the thresholds are configurable.

**Alerts have a cooldown.** A 30% swing stays a 30% swing for the whole trailing
window, so without one, a single move would re-notify on every refresh for a
day. Escalation still breaks through: if a major swing deepens into an extreme
one, that is new information and you hear about it.

**Cards you own and cards you don't are treated differently.** Swings in your
collection raise alerts and push notifications. Swings everywhere else feed the
Movers tab — a browsable feed, not an interruption. Flip `NOTIFY_ON_MARKET_MOVERS`
if you want to be paged for those too.

## Scanning

Three ways in, because the right one differs per platform:

| Input | Where it fits |
| --- | --- |
| `{ "text": "..." }` | Mobile: run OCR on-device and post what it read. Fastest, no upload. |
| Image upload / base64 | Desktop and web: send the photo, the server runs OCR. |
| Typed text | Always available, and the fallback when OCR is unavailable. |

Recognised text is parsed for the few things that actually identify a card —
name, collector number, printed set total, set code — and scored against the
catalog. Signals are weighted and re-normalised over whichever ones survived, so
a scan whose collector number was unreadable is still scored on a 0–1 scale.

A match is auto-accepted only when it is both strong *and* clearly ahead of the
runner-up. Two printings of the same card scoring 0.95 and 0.94 is exactly when
guessing puts the wrong card in your collection, so that case asks.

Server-side OCR (tesseract.js) is optional and lazily initialised. It needs
`eng.traineddata`; point `TESSDATA_PATH` at a directory containing it, or skip it
and post text from the client. The server starts and runs fine either way.

## Layout

```
packages/
  shared/    Domain logic: swing maths, OCR parsing, fuzzy matching. No framework.
  server/    Fastify + SQLite. Catalog, prices, alerts, scan matching.
  app/       Expo + expo-router. iOS, Android and web from one source.
  desktop/   Electron shell that spawns the API and loads the web build.
```

The desktop shell owns the whole stack: it picks free ports, starts the API with
its database under your user data directory, serves the web build over loopback,
and hands the renderer the API URL at runtime. One click, no terminal.

## Configuration

Server, all optional:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4000` | API port |
| `DATABASE_PATH` | `./data/pokedex.db` | SQLite file |
| `PRICE_PROVIDER` | `fixture` | `fixture` or `pokemontcgio` |
| `POKEMONTCG_API_KEY` | — | Raises the rate limit |
| `PRICE_REFRESH_MINUTES` | `60` | Refresh interval |
| `SWING_WINDOWS` | `24,168` | Tracked windows, in hours |
| `NOTIFY_AT_OR_ABOVE` | `major` | Alert threshold for your cards |
| `NOTIFY_ON_MARKET_MOVERS` | `false` | Also push for cards you don't own |
| `ALERT_COOLDOWN_HOURS` | `12` | Repeat-alert suppression |
| `SWING_FLOOR_CENTS` | `50` | Moves below this never alert |
| `HISTORY_RETENTION_DAYS` | `400` | Snapshot pruning horizon |
| `TESSDATA_PATH` | — | Directory holding `eng.traineddata` |
| `API_TOKEN` | — | Shared secret for `/api`. Required when `NODE_ENV=production` |
| `WEB_ROOT` | auto | Exported web build to serve alongside the API |

App: `EXPO_PUBLIC_API_URL` sets the API address at build time. In Expo dev the
app derives it from the dev server's own LAN address, which is what makes a
physical phone work without configuration.

## Testing

```bash
npm test         # 107 tests across shared + server
npm run typecheck
```

The suite covers swing classification and its edge cases, OCR parsing and
matching, the full ingest → change → alert pipeline, the HTTP surface, token
auth (including query-string and lookalike-path bypass attempts), and both
price providers (the live one against an injected `fetch`).

## Known gaps

- **Prices are per printing, not per grade.** A PSA 10 and a raw NM copy of the
  same card are stored separately in your collection but valued from the same
  market price. Graded price feeds are a paid product; the schema already
  carries grading company and grade, so it is a provider change, not a rewrite.
- **English sets only**, following pokemontcg.io's coverage.
- **Push needs an Expo project ID** to deliver to real devices; the in-app alert
  feed works regardless.
- **Sealed product** (boxes, packs, tins) is not modelled.

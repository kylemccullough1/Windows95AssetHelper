# Windows95AssetHelper

A Windows 95 asset studio: a React app that looks and behaves like Windows 95, where you set up a
desktop (windows, taskbar, Start menu, icons), press record, use it like the real thing, and turn
the recording into an After Effects composition.

## What it will do

1. **Sandbox** — a faithful Win95 desktop built from `@duckdgoose/win95-ui` (React95 underneath).
   Drag, resize, snap, minimise, z-order, Start menu, all as the original behaved.
2. **Record → AE comp** — the recording becomes an After Effects comp with keyframes. Every asset
   stays on its own layer, so nothing is baked into a video.
3. **Asset export** — any asset in use, alone or as a group, as SVG/PNG plus a manifest.
4. **Bulk comp export** — every asset as its own comp, in a folder you import into whichever AE
   project you are in.

It runs locally first. Later it will also run deployed, still driving After Effects on the
user's own machine through a small local companion.

## Running it

Two processes. `App/` is the studio you look at; `Companion/` is the local service that writes to
a folder you picked and starts After Effects. **The companion is optional** — without it the
studio still composes and exports, it just hands you files to run yourself with
File > Scripts > Run Script File instead of doing it for you.

### Prerequisites

| | |
|---|---|
| Node | for Vite and the studio's tests |
| .NET 10 SDK | `global.json` pins `10.0.400` with `rollForward: latestFeature` |
| After Effects | optional. Without it the companion still starts and reports `afterEffects.found: false`; the studio then hides the one-click route |

### One-time setup, per worktree

```
bash Scripts/link-win95-ui.sh     # creates App/.win95-ui
cd App && npm install
```

Run this in **each worktree**, not once per clone. Worktrees are separate directories and share
`App/.win95-ui` no more than they share `node_modules`. See
[App/README.md](App/README.md#why-a-link-and-why-not-npm-link) for why the link exists at all and
why it is not `npm link`.

### Build

```
dotnet build Win95AssetHelper.slnx     # backend
cd App && npm run build                # frontend — tsc --noEmit, then vite build
cd App && npm test                     # 75 tests, against the real @react95/icons on disk
```

### Run

Two terminals, because there is deliberately no root `package.json` to hang a combined script off
(a stray `npm install` at the root writes an empty lockfile — see `.gitignore`).

```
# Terminal 1 — backend. Run from the repo root; the --project path is relative to it.
dotnet run --project Companion/Win95Studio.Companion

# Terminal 2 — frontend
cd App && npm run dev
```

Both print the address they are listening on as they start. **Read it from the console, not from
here** — the frontend's port is not fixed (see below), and a URL written into a README is a claim
about whatever else happens to be running on the machine.

### In Rider

Open **`Win95AssetHelper.slnx` — the file, not the folder.** Rider only offers Build and .NET run
configurations for a *solution*; opening the directory gives you a plain folder project with
neither, and it will keep giving you that until you point it at the solution file.

From there, Build works, and the companion's run configuration is generated from its launch
settings with no setup. Run the studio from the ▶ in the gutter next to `dev` in `App/package.json`.

### Check the two are talking

In the studio, open **Export to After Effects**. The panel says *"Set it up for me"* when it can
reach the companion and *"The local companion is not running"* when it cannot. That is the only
part of the setup that fails silently, so it is worth a glance — and it is a better check than a
request by hand, because it exercises the same cross-origin path the studio actually uses.

### If the studio is not where you expect

The dev server's port is configured in `App/vite.config.ts`, but Vite **silently increments** it
when something already holds it — commonly another project's dev server. It does not fail, so the
startup banner is the only authority on where the studio actually is. The companion's CORS accepts
any loopback origin precisely so this cannot break the export panel, but you can still end up
editing one instance and looking at another. See [App/README.md](App/README.md#ports).

See [App/README.md](App/README.md) for the studio and [Companion/README.md](Companion/README.md)
for the runner.

## Status

The studio composes, exports, and (through the companion) sets up After Effects for you. The
recorder from research note 03 is deliberately absent — the pillar kept is "every asset on its own
layer, composed and exported", not "capture movement over time" — so scenes are static and need
no keyframes. Nothing here forecloses adding animation back.

The research behind these decisions (stack, After Effects export format, recording model, asset
model, package publishing, repo layout) lives outside the repo at
`notes/Windows95AssetHelper/research/`, starting with `00-verdict.md`.

## Working in this repo

Branch naming and workflow are in [CONTRIBUTING.md](CONTRIBUTING.md). Each branch is checked out
as its own git worktree folder beside `main/`.

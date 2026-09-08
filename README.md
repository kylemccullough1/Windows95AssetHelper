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

## Status

Phase 0: research. No application code yet. The research (stack, After Effects export format,
recording model, asset model, package publishing, repo layout) lives outside the repo at
`notes/Windows95AssetHelper/research/`, starting with `00-verdict.md`. The next branch builds
the first slice that document recommends.

## Working in this repo

Branch naming and workflow are in [CONTRIBUTING.md](CONTRIBUTING.md). Each branch is checked out
as its own git worktree folder beside `main/`.

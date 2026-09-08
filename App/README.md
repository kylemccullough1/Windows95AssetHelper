# App — the Windows 95 asset studio

Vite + React 19 + TypeScript. The Windows 95 look, the window manager, the taskbar and the icon
catalog all come from `@duckdgoose/win95-ui`, which lives in the **duckdgoose repo** and is not
published to npm yet.

## First run

```
bash Scripts/link-win95-ui.sh     # from the repo root, once per worktree
cd App
npm install
npm run dev
```

`link-win95-ui.sh` creates `App/.win95-ui`, a link to the package source in the sibling
duckdgoose checkout. It finds that checkout by searching upward; pass the path explicitly or set
`WIN95_UI_SRC` if it guesses wrong. The link is gitignored — it points at a location that only
exists on this machine.

Run it once in **each worktree**. Worktrees are separate directories and do not share
`App/.win95-ui` any more than they share `node_modules`.

## Why a link, and why not `npm link`

`@duckdgoose/win95-ui` is deliberately absent from `package.json`: it resolves to a sibling
repository on this machine, so baking the path into the manifest would break for anyone else and
would have to be torn out the day the package is published.

This used to be wired up with `npm link`, which put the symlink inside `node_modules`. That is
exactly where it could not survive: **`npm install` prunes anything in `node_modules` that is not
in `package.json`**, so every install silently deleted the link and the next `npm run dev` died
with `Failed to resolve @duckdgoose/win95-ui`. Putting the link at `App/.win95-ui` — outside
`node_modules` — keeps it invisible to npm.

The path is never written as `../../..` in a tracked file, because worktrees sit at different
depths (`main/App` is one level under the repo root, `defect/app-scaffold/App` is two). Anything
relative-to-root would be correct in one worktree and wrong in the rest.

Three files depend on the link, and all three point at the same stable `.win95-ui` location:

| File | Why it needs the path |
|---|---|
| `vite.config.ts` | `resolve.alias`, plus `server.fs.allow` so Vite will serve files from outside the project |
| `tsconfig.json` | `paths` — TypeScript resolves imports itself and knows nothing about Vite's alias |
| `src/index.css` | Tailwind `@source` — see below |

When the package is published (research note 05), all of this goes away and it becomes an
ordinary dependency at a version number.

## Why the Vite config looks the way it does

Two more lines in `vite.config.ts` are load-bearing and easy to delete by accident.

`optimizeDeps.include` lists React and the packages that only `win95-ui` imports. Because the
package is served from TypeScript source, Vite does not discover its dependencies until
something imports them. A late discovery triggers a second optimisation pass that bundles a
**second copy of React**, and every hook then throws "Invalid hook call". `resolve.dedupe` is
the second line of defence for the same problem.

`build.rolldownOptions.treeshake` declares `@react95/icons` side-effect free. That package ships
975 icons through one barrel file and does not declare `sideEffects` itself, so without this the
bundler keeps every icon and the JS bundle grows by about 3.8 MB.

## Why `@source` is in index.css

Tailwind v4 never scans `node_modules`, and `win95-ui` ships Tailwind utility classes inside its
own components. The `@source` line points the scanner through the link at the package source.
Delete it when the package stops using Tailwind.

## Ports

`server.port` is 5173, but Vite **silently increments** when the port is taken rather than
failing. If the startup banner says 5174 or 5175, an earlier dev server is still running — often
one from the duckdgoose repo. Find it with `netstat -ano | findstr :5173` and stop it, otherwise
you can end up editing one instance and viewing another.

## The asset studio

Two surfaces share the desktop. The window manager from `@duckdgoose/win95-ui` owns windows
(drag, resize, snap, minimise, stack); a free-placement layer owns whatever you drop out of the
asset browser. The **scene document** (`src/scene/types.ts`) is the exportable projection of both
— plain serialisable data with no React in it, because the exporter runs on data, not on a
mounted desktop.

There is no recorder. The pillar here is "every asset on its own layer, composed and exported",
not "capture movement over time", so the scene is static and the export needs no keyframes. The
hold-keyframe and layer-split machinery the spike proved still applies if animation returns.

### The two-stage export

```
Export ▸ Build asset package   →  win95-asset-package.zip   (run once)
                                   ├─ win95-asset-package.jsx
                                   └─ assets/*.png
                                      unzip, run the .jsx → Win95Assets.aep + assets/
Export ▸ This scene            →  win95-scene-<name>.jsx    (run often)
                                   └─ imports that .aep, places layers referencing its comps
```

This is a build/link split, not two exporters. `project.save(file)` on one side and `importFile`
with `ImportAsType.PROJECT` on the other — the AE spike proved that round trip lands a saved
`.aep` in another project as one folder with every comp intact.

The package downloads as a **zip** because the script's job is to copy each asset's PNG next to
the `.aep`, and a browser has no filesystem path to copy *from*. The artwork travels with the
script, which finds it via its own `$.fileName`. Keep the `.jsx` and `assets/` together, and
afterwards keep the `.aep` and its `assets/` together.

Window comps are built by the *scene* script rather than pre-baked into the package, because
their geometry depends on the size you dragged the window to and a package cannot enumerate every
possible size. Their title-bar icons still reference package comps.

### Why the package is PNG footage and not shape layers

The original design rebuilt each icon as After Effects shape rectangles, to keep everything
vector. Measured against the icon set's own PNG as ground truth — rendering each route through
`CompItem.saveFrameToPng` in After Effects 27.0x37 and comparing pixels — that is both less
accurate and far slower:

| format | differing px | anti-aliased px | colours (source has 7) | speed |
|---|---|---|---|---|
| **PNG footage** | **0 / 256** | **0** | **7** | 110 imports/s |
| shape layers | 99 / 256 | 21 | 31 | see below |
| SVG footage | 74 / 256 | 21 | 48 | 63 imports/s |

The emitted geometry is provably correct — painting the rectangles onto a grid reproduces the
reference PNG exactly, with zero overlaps — and AE renders *simple* shape rectangles on integer
boundaries perfectly crisply. It blends the dense interlocking runs a real icon is made of. The
loss is in AE's shape rasteriser, not in this code.

Shape building is also superlinear: 7,033 shapes took 19.5 s and 21,084 took 247 s — 3x the work
for 12.7x the time — producing a 30 MB project for 200 icons. A full-catalogue shape build was
abandoned unfinished after 27 minutes at 3.3 GB of memory.

The full catalogue as PNG footage builds in **174 seconds**: 1517 comps, 0 missing, from a 142 kB
script. Verified pixel-exact end to end, including inside a composed scene — the only deviation
there is a plus-or-minus 1 rounding on pure black at alpha edges, from 8-bit compositing.

`format: 'shapes'` is still available for a handful of assets you want to recolour or edit as
vector in After Effects. It is simply the wrong representation for the whole catalogue.

### Catalogue numbers, measured

| | |
|---|---|
| SVGs in `@react95/icons` 2.5.3 | 1536 (6.6 MB) |
| Drawable (19 ship with no `<path>` and are hidden) | 1517 |
| Distinct artwork — many icons are the same image under different names | 1043 |
| Full catalogue as PNG footage | 1517 comps, 174 s in After Effects |
| Full-catalogue package zip | ~7 MB |

### Layout

```
src/
  assets/     catalogue, SVG path parsing, colours, the Win95 chrome registry
  scene/      the scene document and its projection from the window manager
  export/     ES3 emission, the ExtendScript runtime, the generators, the zip writer
  studio/     desktop shell, asset browser, export panel
```

`assets/`, `scene/` and `export/` import no React and are covered by `npm test` (52 tests). The tests run
against the real `@react95/icons` on disk, not fixtures — the parser's claim is "every one of the
1536 shipped SVGs parses", and a fixture cannot check that.

### Delivery

Export currently hands you a `.jsx` to run with File > Scripts > Run Script File.
`src/export/deliver.ts` is the seam: `ExportTarget` is the whole contract, so the local .NET
companion that runs `AfterFX.com -r` for you drops in as a second implementation rather than a
rewrite.

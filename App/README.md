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

## Layout

```
src/
  studio/     the desktop shell, asset browser and recorder UI
  main.tsx    entry point
  index.css   Tailwind plus the @source line
```

`recording/`, `assets/`, `export/` and `bridge/` join `studio/` as the first slice progresses.
Per research note 06 the recording and export code stays plain TypeScript with no React imports,
so it can be unit tested and reused.

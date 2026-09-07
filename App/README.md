# App — the Windows 95 asset studio

Vite + React 19 + TypeScript. The Windows 95 look, the window manager, the taskbar and the icon
catalog all come from `@duckdgoose/win95-ui`, which lives in the **duckdgoose repo** and is not
published to npm yet.

## First run

```
cd App
npm install
npm link ../../../../personal-new/feature/Setup-And-Migration/Packages/win95-ui
npm run dev
```

The `npm link` step is required and is **not** recorded in `package.json`. That is deliberate:
the path points at a sibling repository on this machine, so baking it into the manifest would
break for anyone else and would have to be torn out again the day the package is published.
Without the link, `npm run dev` fails to resolve `@duckdgoose/win95-ui`.

When the package is published (research note 05), the link goes away and it becomes an ordinary
dependency at a version number.

## Why the Vite config looks the way it does

Two lines in `vite.config.ts` are load-bearing and easy to delete by accident.

`optimizeDeps.include` lists React and the packages that only `win95-ui` imports. Because the
package is linked, Vite serves it from TypeScript source and does not discover its dependencies
until something imports them. A late discovery triggers a second optimisation pass that bundles
a **second copy of React**, and every hook then throws "Invalid hook call". `resolve.dedupe` is
the second line of defence for the same problem.

`build.rolldownOptions.treeshake` declares `@react95/icons` side-effect free. That package ships
975 icons through one barrel file and does not declare `sideEffects` itself, so without this the
bundler keeps every icon and the JS bundle grows by about 3.8 MB.

## Why `@source` is in index.css

Tailwind v4 never scans `node_modules`, and `win95-ui` ships Tailwind utility classes inside its
own components. The `@source` line points the scanner through the link at the package source.
Delete it when the package stops using Tailwind.

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

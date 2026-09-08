import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// @duckdgoose/win95-ui lives in the duckdgoose repo and is not published to npm, so it is
// deliberately absent from package.json. It is reached through App/.win95-ui, a gitignored
// link created by Scripts/link-win95-ui.sh.
//
// This replaced `npm link`. That put the link inside node_modules, where `npm install` deleted
// it every time, because npm prunes anything in the tree that is not in package.json.
//
// The path is resolved from this file's own URL rather than written as "../../.." from the
// repo root, because each git worktree sits at a different depth (main/App is one level down,
// defect/app-scaffold/App is two), so no single relative path is correct in every worktree.
const WIN95_UI = fileURLToPath(new URL('./.win95-ui', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Vite serves win95-ui from its TypeScript source, so its dependencies are only discovered
  // when something first imports them, and a late discovery triggers a second dependency
  // optimisation pass that bundles a SECOND copy of React. Every hook then throws
  // "Invalid hook call". Listing them here makes the first pass see everything.
  optimizeDeps: {
    include: ['react', 'react-dom', '@react95/core', '@react95/icons', 'react-rnd'],
  },

  resolve: {
    alias: { '@duckdgoose/win95-ui': WIN95_UI },

    // Belt and braces for the same problem: force every import of react and react-dom to
    // resolve to one copy, whichever path it arrives through.
    dedupe: ['react', 'react-dom'],
  },

  build: {
    rolldownOptions: {
      treeshake: {
        // @react95/icons ships 975 icons through a single barrel file and declares no
        // "sideEffects" field, so the bundler has to assume importing it does work and keeps
        // every icon. Declaring it side-effect free lets the unused ones be dropped. Measured
        // at 3.8 MB of JS without this in the duckdgoose project.
        moduleSideEffects: (id: string) => !id.includes('@react95/icons'),
      },
    },
  },

  server: {
    port: 5173,

    // The link resolves to a path outside this project, and Vite will not serve files from
    // outside the workspace root unless they are listed here.
    fs: { allow: ['..', WIN95_UI] },
  },
})

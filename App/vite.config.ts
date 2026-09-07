import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // @duckdgoose/win95-ui is linked with `npm link`, so Vite resolves the symlink and serves
  // the package from its TypeScript source. Its dependencies are therefore only discovered
  // when something first imports them, and a late discovery triggers a second dependency
  // optimisation pass that bundles a SECOND copy of React. Every hook then throws
  // "Invalid hook call". Listing them here makes the first pass see everything.
  optimizeDeps: {
    include: ['react', 'react-dom', '@react95/core', '@react95/icons', 'react-rnd'],
  },

  // Belt and braces for the same problem: force every import of react and react-dom to
  // resolve to one copy, whichever path it arrives through.
  resolve: { dedupe: ['react', 'react-dom'] },

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

  server: { port: 5173 },
})

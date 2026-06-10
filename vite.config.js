import { defineConfig } from 'vite';
import { resolve } from 'path';

// GitHub Pages serves this project at https://a-organvm.github.io/gamified-coach-interface/
// so built asset URLs must be prefixed with the repo subpath. Override with
// VITE_BASE=/ for deploys that serve from the domain root.
const base = process.env.VITE_BASE ?? '/gamified-coach-interface/';

export default defineConfig({
  base,
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        client: resolve(__dirname, 'client.html'),
        evolved: resolve(__dirname, 'legion-command-center-evolved.html'),
        v3: resolve(__dirname, 'v3/index.html'),
        v3Legacy: resolve(__dirname, 'legion-v3.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: `${base}v3/`
  }
});

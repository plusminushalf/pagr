import { defineConfig } from 'vite';

// https://vitejs.dev/config
// chokidar has native-ish bindings via fsevents on macOS; externalize to avoid Vite bundling issues.
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['chokidar', 'fsevents'],
    },
  },
});

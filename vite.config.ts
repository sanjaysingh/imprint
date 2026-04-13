import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Root base for custom domain (and local dev / preview). */
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  plugins: [
    {
      name: 'copy-root-cname',
      closeBundle() {
        const src = resolve(__dirname, 'CNAME');
        const dest = resolve(__dirname, 'dist', 'CNAME');
        if (existsSync(src)) copyFileSync(src, dest);
      },
    },
  ],
});

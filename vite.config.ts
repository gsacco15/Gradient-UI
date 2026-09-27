import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { labTags } from './api/share';

/**
 * The Lab gets its own static page (dist/led.html) with its own title and link-card image baked in,
 * so link previews for /led never depend on a server function.
 */
function labPage(): Plugin {
  let out = 'dist';
  return {
    name: 'atmos-lab-page',
    apply: 'build',
    configResolved(c) {
      out = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const html = readFileSync(resolve(out, 'index.html'), 'utf8');
      const lab = html.replace(/<!-- share:start[\s\S]*?share:end -->/, labTags('https://gradient-ui.vercel.app'));
      if (lab === html) throw new Error('led.html: share block not found in index.html');
      writeFileSync(resolve(out, 'led.html'), lab);
    },
  };
}

// Absolute base: the app has real routes (/ and /studio), so assets must resolve from the root.
export default defineConfig({
  base: '/',
  plugins: [react(), labPage()],
});

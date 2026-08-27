import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function copyStatic() {
  return {
    name: 'copy-pwa-assets',
    closeBundle() {
      // PWA + Tauri statische Dateien 1:1 nach dist kopieren
      const files = ['sw.js', 'manifest.json', 'version.json'];
      for (const f of files) {
        if (existsSync(f)) copyFileSync(f, join('dist', f));
      }
      // assets/ komplett kopieren (unverhashed für manifest + Tauri)
      if (existsSync('assets')) {
        const dest = join('dist', 'assets');
        mkdirSync(dest, { recursive: true });
        for (const file of readdirSync('assets')) {
          const src = join('assets', file);
          if (statSync(src).isFile()) copyFileSync(src, join(dest, file));
        }
      }
    },
  };
}

export default defineConfig({
  // GitHub Pages: https://dabros-ai-coder.github.io/Idle-Hacker-Tycoon/
  // Für Pages-Deploy base setzen, lokal egal (dev nutzt /)
  base: process.env.GITHUB_ACTIONS ? '/Idle-Hacker-Tycoon/' : './',
  server: {
    port: 1420,
    strictPort: false,
    host: '0.0.0.0',
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // PWA: sw.js + manifest.json sollen 1:1 kopiert werden
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  plugins: [copyStatic()],
  // Tauri erwartet statische Assets ohne Hash-Probleme
  clearScreen: false,
});

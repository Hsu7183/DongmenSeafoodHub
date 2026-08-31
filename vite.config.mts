import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import path from 'node:path';

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS = 'false';
  process.env.WRANGLER_LOG_PATH = '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH = '.wrangler/registry';
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    resolve: { alias: { '@': path.resolve('.') } },
    environments: { server: { build: { rolldownOptions: { output: { entryFileNames: 'index.js' } } } } },
    css: { postcss: { plugins: [tailwindcss()] } },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    plugins: [react(), sites(), cloudflare({
      viteEnvironment: { name: 'server' },
      config: {
        name: 'dongmen-seafood-portal', main: './portal/worker.ts',
        compatibility_date: '2026-05-15', compatibility_flags: ['nodejs_compat'],
        assets: { not_found_handling: 'single-page-application', run_worker_first: true },
        d1_databases: [{ binding: 'DB', database_name: 'dongmen-orders', database_id: '00000000-0000-4000-8000-000000000000' }],
      },
    })],
  };
});

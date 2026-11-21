import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import svgr from 'vite-plugin-svgr';

const svgImportPlugin = () => ({
  name: 'svg-import-alias',
  resolveId(id) {
    if (id.includes('?import&react')) {
      return id.replace('?import&react', '?react');
    }
    return null;
  },
});

const violetApiPlugin = () => ({
  name: 'violet-api-server',
  configureServer(server) {
    let apiModulePromise = null;

    const loadApiModule = () => {
      if (!apiModulePromise) {
        apiModulePromise = server.ssrLoadModule('/src/server/violetApiServer.ts').catch((err) => {
          console.error('[Violet API Middleware] Failed to load violetApiServer:', err);
          apiModulePromise = null;
          throw err;
        });
      }
      return apiModulePromise;
    };

    if (server.httpServer) {
      server.httpServer.once('listening', () => {
        loadApiModule().catch((err) => {
          console.error('[Violet API Middleware] Pre-warm failed:', err);
        });
      });

      server.httpServer.on('close', () => {
        apiModulePromise = null;
      });
    }

    // Invalidate cached server module whenever any backend server file changes
    server.watcher.on('all', (_event, file) => {
      const normalized = (file || '').replace(/\\/g, '/');
      if (normalized.includes('/src/server/') || normalized.includes('vite.config')) {
        apiModulePromise = null;
      }
    });

    server.middlewares.use(async (req, res, next) => {
      const url = req.url || '';
      if (url.startsWith('/api/v1/') || url === '/api/v1') {
        try {
          const { handleVioletApiRequest } = await loadApiModule();
          const handled = handleVioletApiRequest(req, res);
          if (handled) return;
        } catch (err) {
          console.error('[Violet API Middleware] Error handling request:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'VIOLET API Middleware Error',
                message: err instanceof Error ? err.message : String(err),
              })
            );
          }
          return;
        }
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    svgImportPlugin(),
    violetApiPlugin(),
    svgr({
      svgrOptions: {
        exportType: 'named',
        namedExport: 'ReactComponent',
        ref: true,
        svgo: false,
        titleProp: true,
      },
      include: '**/*.svg?react',
    }),
  ],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.violet/**', '**/.git/**'],
  },
  server: {
    allowedHosts: true,
    hmr: false,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'motion';
          if (id.includes('react-dom') || id.includes('node_modules/react/')) return 'react-vendor';
          if (id.includes('lucide-react')) return 'icons';
        },
      },
    },
  },
});


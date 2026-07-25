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

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    svgImportPlugin(),
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

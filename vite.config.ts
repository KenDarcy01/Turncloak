import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode singlefile` inlines everything into one HTML file for the hosted preview.
export default defineConfig(({ mode }) => ({
  // Relative paths so the build works from any folder, such as GitHub Pages' /turncloak/.
  base: './',
  plugins: mode === 'singlefile' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'singlefile' ? { outDir: 'dist-preview' } : {},
}));

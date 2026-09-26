import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Absolute base: the app has real routes (/ and /studio), so assets must resolve from the root.
export default defineConfig({
  base: '/',
  plugins: [react()],
});

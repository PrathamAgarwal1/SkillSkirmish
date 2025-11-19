import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // --- ADD THIS SECTION ---
  // This tells Vite to replace any occurrence of 'global' with 'globalThis',
  // which is a standard variable available in both Node and browsers.
  define: {
    global: 'globalThis'
  }
  // --- END OF SECTION ---
})
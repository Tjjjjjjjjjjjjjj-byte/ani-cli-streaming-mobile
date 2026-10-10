import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Phone-only: the app and API listen on this device (localhost) only.
export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  server: {
    host: "127.0.0.1",
    watch: { ignored: ["**/backend/downloads/**", "**/backend/library/**"] },
  },
})

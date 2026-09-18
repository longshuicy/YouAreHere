import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Honour PORT so several worktrees can run their own dev server at once;
  // Vite would otherwise take 5173 in every checkout and serve whichever
  // branch got there first.
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
})

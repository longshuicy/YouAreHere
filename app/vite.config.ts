import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves a project site from /<repo>/, not from the root, and a
  // build made for the root emits absolute /assets/... paths that 404 there.
  // The workflow passes the repository name rather than this file naming it, so
  // a rename or a fork does not need an edit here.
  base: process.env.BASE_PATH ?? '/',
  // Honour PORT so several worktrees can run their own dev server at once;
  // Vite would otherwise take 5173 in every checkout and serve whichever
  // branch got there first.
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
})

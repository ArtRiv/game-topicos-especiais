import { defineConfig } from 'vite';

export default defineConfig({
  // Inline empty postcss config — bypasses postcss-load-config's filesystem search
  // entirely. Without this, Vite walks UP from the project root looking for a postcss
  // config and lands on C:\Users\Arthu\postcss.config.mjs (a Tailwind config in the
  // user's home folder) which crashes the dev server with a plugin error. The project
  // doesn't use PostCSS, so an empty plugins array is the correct configuration.
  css: {
    postcss: { plugins: [] },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/js/[name]-[hash].js',
      },
    },
  },
});

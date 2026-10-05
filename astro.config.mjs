import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://niu-life.app',
  // Plain files: /privacy.html stays the address Play Console links to.
  build: { format: 'file' },
});

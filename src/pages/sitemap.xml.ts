import type { APIRoute } from 'astro';
import { INDEXED_PAGES } from '../site';

// The pages worth indexing; /open/* and 404 stay out (they are noindex).
export const GET: APIRoute = ({ site }) => {
  const urls = INDEXED_PAGES.map((path) => `  <url><loc>${new URL(path, site)}</loc></url>`).join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
};

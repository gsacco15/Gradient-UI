// Share links (/g/<code>): serve the app with this gradient's title, description and preview
// image in the page head, so link cards in messages and social apps show the gradient.
// The browser then boots the normal app, which opens the gradient in the landing-page viewer.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface Row {
  name: string;
  place: string;
  author: string;
  preview_path: string | null;
  gradient: { time?: string; points?: { color?: string }[] };
}

async function lookup(slug: string): Promise<Row | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY || !/^[A-Za-z0-9_-]{4,40}$/.test(slug)) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/community_gradients?slug=eq.${slug}&select=name,place,author,preview_path,gradient&limit=1`, {
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Row[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Head tags for a page: title, description and a large link-card image. */
export function pageTags(t: { title: string; description: string; url: string; image: string | null; alt?: string }): string {
  return [
    `<title>${esc(t.title)}</title>`,
    `<meta name="description" content="${esc(t.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Atmos" />`,
    `<meta property="og:title" content="${esc(t.title)}" />`,
    `<meta property="og:description" content="${esc(t.description)}" />`,
    `<meta property="og:url" content="${esc(t.url)}" />`,
    t.image ? `<meta property="og:image" content="${esc(t.image)}" />` : '',
    t.image ? `<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />` : '',
    t.image && t.alt ? `<meta property="og:image:alt" content="${esc(t.alt)}" />` : '',
    `<meta name="twitter:card" content="${t.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(t.title)}" />`,
    `<meta name="twitter:description" content="${esc(t.description)}" />`,
    t.image ? `<meta name="twitter:image" content="${esc(t.image)}" />` : '',
  ]
    .filter(Boolean)
    .join('\n    ');
}

/** The Lab's own link card. */
export const labTags = (origin: string) =>
  pageTags({
    title: 'Atmos Lab — put your sky on the wall',
    description: 'Turn any gradient into an LED light piece in the spirit of James Turrell. Preview it on your frame, get the build sheet, and send it to your LEDs.',
    url: `${origin}/led`,
    image: `${origin}/og-lab.jpg?v=1`,
    alt: 'An oval LED light piece: bare LEDs on one half, the diffused glow on the other, beside the words Put your sky on the wall.',
  });

export function metaTags(row: Row, pageUrl: string): string {
  const title = `${row.name} · Atmos`;
  const colours = (row.gradient.points ?? []).map((p) => p.color).filter(Boolean).slice(0, 6).join(' · ');
  const description = `${row.place}${row.gradient.time ? ` at ${row.gradient.time}` : ''}. A gradient by ${row.author}${colours ? ` — ${colours}` : ''}. Open it in Atmos.`;
  const image = row.preview_path ? `${SUPABASE_URL}/storage/v1/object/public/previews/${row.preview_path}` : null;
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Atmos" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(pageUrl)}" />`,
    image ? `<meta property="og:image" content="${esc(image)}" />` : '',
    image ? `<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    image ? `<meta name="twitter:image" content="${esc(image)}" />` : '',
  ]
    .filter(Boolean)
    .join('\n    ');
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') ?? '';
  if (url.searchParams.get('page') === 'lab') {
    const shell = await fetch(new URL('/index.html', url.origin)).then((r) => r.text());
    return new Response(shell.replace(/<!-- share:start[\s\S]*?share:end -->/, labTags(url.origin)), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' },
    });
  }
  const [shell, row] = await Promise.all([fetch(new URL('/index.html', url.origin)).then((r) => r.text()), lookup(slug)]);
  const pageUrl = `${url.origin}/g/${slug}`;
  const html = row ? shell.replace(/<!-- share:start[\s\S]*?share:end -->/, metaTags(row, pageUrl)) : shell;
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400' },
  });
}

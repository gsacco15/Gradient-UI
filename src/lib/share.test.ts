import { afterEach, describe, expect, it, vi } from 'vitest';

describe('/g/<code> link previews', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('injects the gradient title, description and preview image', async () => {
    process.env.VITE_SUPABASE_URL = 'https://proj.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon';
    vi.resetModules();
    const shell = '<html><head>\n<!-- share:start x -->\n<title>Atmos Studio</title>\n<meta property="og:title" content="home" />\n<!-- share:end -->\n</head></html>';
    const row = { name: 'NEON PUDDLE', place: 'SHIBUYA', author: 'Grant', preview_path: 'u1/p.jpg', gradient: { time: '02:10', points: [{ color: '#0A0A12' }, { color: '#E13CA8' }] } };
    vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => (String(u).includes('/rest/v1/') ? Response.json([row]) : new Response(shell))));
    const { GET } = await import('../../api/share');
    const html = await (await GET(new Request('https://atmos.app/api/share?slug=abc123xyz'))).text();
    expect(html).toContain('<title>NEON PUDDLE · Atmos</title>');
    expect(html).toContain('og:image" content="https://proj.supabase.co/storage/v1/object/public/previews/u1/p.jpg"');
    expect(html).toContain('og:url" content="https://atmos.app/g/abc123xyz"');
    expect(html).toContain('#0A0A12 · #E13CA8');
    expect(html).not.toContain('content="home"');
  });

  it('serves the normal page for unknown or malformed codes', async () => {
    vi.resetModules();
    const shell = '<!-- share:start --><title>Atmos Studio</title><!-- share:end -->';
    vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => (String(u).includes('/rest/v1/') ? Response.json([]) : new Response(shell))));
    const { GET } = await import('../../api/share');
    expect(await (await GET(new Request('https://atmos.app/api/share?slug=nope1234'))).text()).toBe(shell);
    expect(await (await GET(new Request('https://atmos.app/api/share?slug=%3Cscript%3E'))).text()).toBe(shell);
  });

  it('escapes names so they cannot inject HTML', async () => {
    const { metaTags } = await import('../../api/share');
    const tags = metaTags({ name: '"><script>x</script>', place: 'P', author: 'A', preview_path: null, gradient: {} }, 'https://a/g/x');
    expect(tags).not.toContain('<script>');
    expect(tags).toContain('&lt;script&gt;');
  });
});

describe('/led link preview', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('serves the Lab card', async () => {
    vi.resetModules();
    const shell = '<head><!-- share:start --><title>Atmos</title><!-- share:end --></head>';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(shell)));
    const { GET } = await import('../../api/share');
    const html = await (await GET(new Request('https://atmos.app/api/share?page=lab'))).text();
    expect(html).toContain('<title>Atmos Lab — put your sky on the wall</title>');
    expect(html).toContain('og:image" content="https://atmos.app/og-lab.jpg?v=1"');
    expect(html).toContain('og:url" content="https://atmos.app/led"');
  });
});

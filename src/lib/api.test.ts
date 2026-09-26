import { describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500; }
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class Anthropic { beta = { messages: { create } }; static APIError = APIError; static RateLimitError = RateLimitError; static AuthenticationError = AuthenticationError; }
  return { default: Anthropic };
});

describe('/api/generate', () => {
  it('asks Claude with structured output + fallbacks and returns a sanitized gradient', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    create.mockResolvedValue({
      stop_reason: 'end_turn',
      model: 'claude-opus-5',
      content: [{ type: 'text', text: JSON.stringify({ name: 'Neon Puddle', place: 'Shibuya', time: '02:10', coords: '35.66° N · 139.70° E', type: 'mesh', angle: 180, colors: ['#0A0A12', '#E13CA8', '#56F0FF'], symmetry: 'none', motion: 'drift', fog: 0.2, haze: 0.35, frost: 0, clouds: 0, heat: 0, dusk: 0.2, note: 'Signs reflected in rain.' }) }],
    });
    const { POST } = await import('../../api/generate');
    const res = await POST(new Request('http://x/api/generate', { method: 'POST', headers: { 'x-forwarded-for': '1.1.1.1' }, body: JSON.stringify({ prompt: 'Tokyo rain at 2am' }) }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.gradient.name).toBe('NEON PUDDLE');
    const args = create.mock.calls[0][0];
    expect(args.model).toBe('claude-opus-5');
    expect(args.fallbacks).toBe('default');
    expect(args.betas).toContain('server-side-fallback-2026-07-01');
    expect(args.output_config.format.type).toBe('json_schema');
  });
  it('reports refusals and rate limits', async () => {
    create.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    const { POST } = await import('../../api/generate');
    const res = await POST(new Request('http://x/api/generate', { method: 'POST', headers: { 'x-forwarded-for': '2.2.2.2' }, body: JSON.stringify({ prompt: 'x' }) }));
    expect(res.status).toBe(422);
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await POST(new Request('http://x', { method: 'POST', headers: { 'x-forwarded-for': '3.3.3.3' }, body: '{"prompt":"a"}' }))).status;
    expect(last).toBe(429);
  });
});

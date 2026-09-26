// Video export: WebCodecs + muxers (faster than real time, frame exact),
// falling back to MediaRecorder in browsers without VideoEncoder.
import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from 'mp4-muxer';
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from 'webm-muxer';
import { GradientRenderer } from '../render/renderer';

export type VideoFormat = 'mp4' | 'webm';

export interface VideoJob {
  format: VideoFormat;
  width: number;
  height: number;
  fps: number;
  frames: number;
  draw: (r: GradientRenderer, frame: number) => void;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
  prepare?: (r: GradientRenderer) => void;
}

export const canEncode = () => typeof window !== 'undefined' && 'VideoEncoder' in window;

interface CodecChoice {
  codec: string; // WebCodecs codec string
  mux: 'avc' | 'vp9' | 'V_VP9' | 'V_VP8';
}

// MP4 prefers H.264; browsers without an H.264 encoder (e.g. open-source Chromium) get VP9-in-MP4.
async function pickCodec(format: VideoFormat, width: number, height: number, fps: number): Promise<CodecChoice | null> {
  const candidates: CodecChoice[] =
    format === 'mp4'
      ? [
          ...['avc1.640034', 'avc1.640033', 'avc1.64002A', 'avc1.4D0034', 'avc1.42003E'].map((codec) => ({ codec, mux: 'avc' as const })),
          ...['vp09.00.51.08', 'vp09.00.41.08', 'vp09.00.10.08'].map((codec) => ({ codec, mux: 'vp9' as const })),
        ]
      : [
          ...['vp09.00.51.08', 'vp09.00.41.08', 'vp09.00.10.08'].map((codec) => ({ codec, mux: 'V_VP9' as const })),
          { codec: 'vp8', mux: 'V_VP8' as const },
        ];
  for (const c of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported({ codec: c.codec, width, height, framerate: fps, bitrate: 1e7 });
      if (res.supported) return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function exportVideo(job: VideoJob): Promise<Blob> {
  // H.264 needs even dimensions.
  const width = job.width - (job.width % 2);
  const height = job.height - (job.height % 2);
  const canvas = document.createElement('canvas');
  const r = new GradientRenderer(canvas, true);
  r.setSize(width, height);
  job.prepare?.(r);
  try {
    if (canEncode()) {
      const codec = await pickCodec(job.format, width, height, job.fps);
      if (codec) return await encodeWithWebCodecs(job, r, codec, width, height);
    }
    return await recordRealtime(job, r);
  } finally {
    (canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context'))?.loseContext();
  }
}

async function encodeWithWebCodecs(job: VideoJob, r: GradientRenderer, choice: CodecChoice, width: number, height: number): Promise<Blob> {
  const mp4 = job.format === 'mp4';
  const target = mp4 ? new Mp4Target() : new WebmTarget();
  const muxer = mp4
    ? new Mp4Muxer({ target: target as Mp4Target, video: { codec: choice.mux as 'avc' | 'vp9', width, height, frameRate: job.fps }, fastStart: 'in-memory' })
    : new WebmMuxer({ target: target as WebmTarget, video: { codec: choice.mux as 'V_VP9' | 'V_VP8', width, height, frameRate: job.fps } });

  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => (muxer as Mp4Muxer<Mp4Target>).addVideoChunk(chunk, meta),
    error: (e) => (failure = e),
  });
  const bitrate = Math.min(40e6, Math.max(4e6, width * height * job.fps * 0.12));
  encoder.configure({ codec: choice.codec, width, height, bitrate, framerate: job.fps });

  const us = 1e6 / job.fps;
  for (let i = 0; i < job.frames; i++) {
    if (job.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    if (failure) throw failure;
    job.draw(r, i);
    const frame = new VideoFrame(r.canvas, { timestamp: Math.round(i * us), duration: Math.round(us) });
    encoder.encode(frame, { keyFrame: i % (job.fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 6) await new Promise((res) => setTimeout(res, 2));
    if (i % 5 === 0) {
      job.onProgress?.(i / job.frames);
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  await encoder.flush();
  encoder.close();
  muxer.finalize();
  job.onProgress?.(1);
  return new Blob([(target as Mp4Target).buffer], { type: mp4 ? 'video/mp4' : 'video/webm' });
}

async function recordRealtime(job: VideoJob, r: GradientRenderer): Promise<Blob> {
  const types = job.format === 'mp4' ? ['video/mp4;codecs=avc1', 'video/mp4'] : ['video/webm;codecs=vp9', 'video/webm'];
  const mime = [...types, 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('This browser cannot record video.');
  const stream = r.canvas.captureStream(job.fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res) => (rec.onstop = () => res()));
  rec.start(250);
  const start = performance.now();
  for (let i = 0; i < job.frames; i++) {
    if (job.signal?.aborted) break;
    job.draw(r, i);
    job.onProgress?.(i / job.frames);
    const due = start + ((i + 1) * 1000) / job.fps;
    await new Promise((res) => setTimeout(res, Math.max(0, due - performance.now())));
  }
  rec.stop();
  await done;
  if (job.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  return new Blob(chunks, { type: mime.split(';')[0] });
}

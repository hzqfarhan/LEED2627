// Stream frames from the page straight into ffmpeg
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { renameSync } from 'node:fs';
const FPS = 30, DUR = Number(process.argv[2] ?? 30);
const out = '/tmp/vid/silent.tmp.mp4';
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-crf', '19', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file:///tmp/vid/stage.html'); await p.waitForTimeout(800);
const N = Math.round(DUR * FPS);
for (let i = 0; i < N; i++) {
  await p.evaluate((t) => render(t), i / FPS);
  const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 150 === 0) console.log('frame', i, '/', N);
}
ff.stdin.end(); await b.close();
const code = await new Promise((r) => ff.on('close', r));
if (code === 0) renameSync(out, '/tmp/vid/silent.mp4'); else console.log('ffmpeg failed', code);

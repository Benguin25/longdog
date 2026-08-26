// Long Dog — synthesized sound effects (SPEC "Juice": all sounds synthesized
// to .wav via a script, committed, under 500KB total).
//
// Pure node/tsx, no dependencies, fully deterministic (seeded PRNG): running
// the script always regenerates byte-identical files.
//
// Usage: npx tsx scripts/sounds.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SAMPLE_RATE = 22050;
const OUT_DIR = resolve(__dirname, '..', 'assets', 'sounds');
const BUDGET_BYTES = 500 * 1024;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const secs = (s: number) => Math.round(s * SAMPLE_RATE);

/** Exponential decay envelope. */
const decay = (i: number, total: number, k: number) => Math.exp((-k * i) / total);

/** Simple one-pole low-pass, in place. */
function lowpass(buf: Float64Array, alpha: number): void {
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y += alpha * (buf[i] - y);
    buf[i] = y;
  }
}

/** Normalize to peak, add short edge fades so nothing clicks. */
function finalize(buf: Float64Array, peak = 0.85): Float64Array {
  let max = 1e-9;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const g = peak / max;
  const fade = Math.min(secs(0.004), buf.length >> 2);
  for (let i = 0; i < buf.length; i++) {
    let v = buf[i] * g;
    if (i < fade) v *= i / fade;
    if (i >= buf.length - fade) v *= (buf.length - 1 - i) / fade;
    buf[i] = v;
  }
  return buf;
}

function writeWav(name: string, samples: Float64Array): number {
  const n = samples.length;
  const data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 2, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16); // fmt chunk size
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(1, 22); // mono
  data.writeUInt32LE(SAMPLE_RATE, 24);
  data.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  data.writeUInt16LE(2, 32); // block align
  data.writeUInt16LE(16, 34); // bits per sample
  data.write('data', 36);
  data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUT_DIR, name), data);
  return data.length;
}

// ---------------------------------------------------------------------------
// The sounds
// ---------------------------------------------------------------------------

/** Munch: three quick filtered-noise chomps, each duller than the last. */
function crunch(): Float64Array {
  const rnd = mulberry32(101);
  const out = new Float64Array(secs(0.3));
  const bursts = [0, 0.095, 0.19];
  bursts.forEach((t0, bi) => {
    const start = secs(t0);
    const len = secs(0.07);
    const burst = new Float64Array(len);
    for (let i = 0; i < len; i++) burst[i] = (rnd() * 2 - 1) * decay(i, len, 7);
    lowpass(burst, 0.5 - bi * 0.13);
    for (let i = 0; i < len && start + i < out.length; i++) {
      out[start + i] += burst[i] * (1 - bi * 0.18);
    }
  });
  return finalize(out);
}

/** Death yelp: a sharp up-then-down chirp with vibrato — hurt but cartoony. */
function yelp(): Float64Array {
  const out = new Float64Array(secs(0.34));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const u = i / out.length;
    const f = u < 0.18 ? 620 + (1450 - 620) * (u / 0.18) : 1450 - 950 * ((u - 0.18) / 0.82);
    const vib = 1 + 0.025 * Math.sin(2 * Math.PI * 38 * (i / SAMPLE_RATE));
    phase += (2 * Math.PI * f * vib) / SAMPLE_RATE;
    const env = Math.min(1, i / secs(0.008)) * decay(i, out.length, 4.2);
    out[i] = (Math.sin(phase) + 0.35 * Math.sin(2 * phase)) * env;
  }
  return finalize(out);
}

/** Stone crack: impulse + crackles + a low rumble (statue transition). */
function crack(): Float64Array {
  const rnd = mulberry32(303);
  const out = new Float64Array(secs(0.34));
  // Main fracture: broadband burst.
  for (let i = 0; i < secs(0.05); i++) out[i] += (rnd() * 2 - 1) * decay(i, secs(0.05), 3.5);
  // Discrete crackle clicks trailing off.
  for (let c = 0; c < 11; c++) {
    const at = secs(0.03) + Math.floor(rnd() * secs(0.24));
    const amp = 0.65 * (1 - c / 14);
    for (let i = 0; i < secs(0.006) && at + i < out.length; i++) {
      out[at + i] += (rnd() * 2 - 1) * amp * decay(i, secs(0.006), 2);
    }
  }
  lowpass(out, 0.55);
  // Low rumble underneath.
  for (let i = 0; i < out.length; i++) {
    out[i] += 0.5 * Math.sin((2 * Math.PI * 78 * i) / SAMPLE_RATE) * decay(i, out.length, 5.5);
  }
  return finalize(out);
}

/** Happy bark: two short "arf!"s, the second a bit higher. */
function bark(): Float64Array {
  const rnd = mulberry32(404);
  const out = new Float64Array(secs(0.46));
  const one = (start: number, base: number) => {
    const len = secs(0.13);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const f = base * (1.35 - 0.5 * u); // pitch drops through the bark
      phase += (2 * Math.PI * f) / SAMPLE_RATE;
      // Saw-ish tone driven into tanh gives it a chesty "arf" formant.
      const saw = 2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5));
      const tone = Math.tanh(2.6 * saw) + 0.3 * Math.sin(2 * phase);
      const breath = (rnd() * 2 - 1) * 0.35 * decay(i, len, 9);
      const env = Math.min(1, i / secs(0.006)) * decay(i, len, 3.6);
      const at = secs(start) + i;
      if (at < out.length) out[at] += (tone + breath) * env;
    }
  };
  one(0, 210);
  one(0.21, 255);
  return finalize(out);
}

/** Soft landing thump (squash after a fall). */
function land(): Float64Array {
  const rnd = mulberry32(505);
  const out = new Float64Array(secs(0.16));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const u = i / out.length;
    const f = 150 - 95 * u;
    phase += (2 * Math.PI * f) / SAMPLE_RATE;
    out[i] = Math.sin(phase) * decay(i, out.length, 5);
  }
  for (let i = 0; i < secs(0.02); i++) out[i] += (rnd() * 2 - 1) * 0.3 * decay(i, secs(0.02), 4);
  return finalize(out, 0.8);
}

/** Dog-house door creak (new dog spawns). */
function door(): Float64Array {
  const out = new Float64Array(secs(0.3));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const u = i / out.length;
    const f = 165 + 80 * u;
    const stick = 0.6 + 0.4 * Math.sin(2 * Math.PI * 27 * (i / SAMPLE_RATE)); // creaky wobble
    phase += (2 * Math.PI * f * stick) / SAMPLE_RATE;
    const saw = 2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5));
    const env = Math.sin(Math.PI * u); // swell in and out
    out[i] = Math.tanh(1.8 * saw) * env * 0.8;
  }
  lowpass(out, 0.35);
  return finalize(out, 0.7);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const files: Record<string, () => Float64Array> = {
  'crunch.wav': crunch,
  'yelp.wav': yelp,
  'crack.wav': crack,
  'bark.wav': bark,
  'land.wav': land,
  'door.wav': door,
};

let total = 0;
for (const [name, synth] of Object.entries(files)) {
  const bytes = writeWav(name, synth());
  total += bytes;
  console.log(`${name.padEnd(12)} ${(bytes / 1024).toFixed(1)} KB`);
}
console.log(`total        ${(total / 1024).toFixed(1)} KB (budget ${BUDGET_BYTES / 1024} KB)`);
if (total > BUDGET_BYTES) {
  console.error('ERROR: sound budget exceeded');
  process.exit(1);
}

/* Generates tiny PCM WAV sound effects for Path Painter (no external assets).
 * Mono, 22050 Hz, 16-bit. Deterministic — run once to (re)create src/assets/sfx. */
const fs = require("fs");
const path = require("path");
const RATE = 22050;

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE((s * 32767) | 0, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// tone: freq (Hz or array of freqs summed), duration s, attack/decay envelope
function tone(freqs, dur, { decay = 6, gain = 0.5, vibrato = 0 } = {}) {
  const n = Math.floor(RATE * dur);
  const fs_ = Array.isArray(freqs) ? freqs : [freqs];
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t * 120) * Math.exp(-decay * t); // fast attack, exp decay
    let v = 0;
    for (const f of fs_) {
      const fm = f * (1 + vibrato * Math.sin(2 * Math.PI * 7 * t));
      v += Math.sin(2 * Math.PI * fm * t);
    }
    out[i] = (v / fs_.length) * env * gain;
  }
  return out;
}

function concat(...arrs) { return [].concat(...arrs); }

const out = path.join(__dirname, "..", "src", "assets", "sfx");
// move: soft short tick
fs.writeFileSync(path.join(out, "move.wav"), wav(tone(420, 0.09, { decay: 22, gain: 0.35 })));
// paint tile plink (slightly higher)
fs.writeFileSync(path.join(out, "tap.wav"), wav(tone(660, 0.07, { decay: 26, gain: 0.3 })));
// win: rising major chord arpeggio
fs.writeFileSync(path.join(out, "win.wav"), wav(concat(
  tone(523, 0.12, { decay: 7, gain: 0.4 }),
  tone(659, 0.12, { decay: 7, gain: 0.4 }),
  tone([784, 1047], 0.3, { decay: 5, gain: 0.45 })
)));
// fail: gentle low thud (no harshness — "Everyone" rating)
fs.writeFileSync(path.join(out, "fail.wav"), wav(concat(
  tone(300, 0.1, { decay: 10, gain: 0.4 }),
  tone(200, 0.25, { decay: 8, gain: 0.4 })
)));
console.log("wrote sfx:", fs.readdirSync(out));

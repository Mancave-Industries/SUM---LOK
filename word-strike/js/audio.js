// audio.js — WebAudio-synthesised sound effects. No external audio files.
// Exposes only setEnabled()/isEnabled()/play(); nothing else touches
// AudioContext directly.

let ctx = null;
let enabled = true;

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function setEnabled(value) {
  enabled = !!value;
}

export function isEnabled() {
  return enabled;
}

function tone(c, { freq, freqEnd = null, duration = 0.12, type = "sine", gain = 0.18, delay = 0 }) {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  const t0 = c.currentTime + delay;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
  }
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.015, duration / 4));
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noiseBurst(c, { duration = 0.15, gain = 0.15, delay = 0, filterFreq = 900 }) {
  const bufferSize = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  const amp = c.createGain();
  const t0 = c.currentTime + delay;
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(filter).connect(amp).connect(c.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

const EFFECTS = {
  select(c) {
    tone(c, { freq: 920, duration: 0.045, type: "square", gain: 0.09 });
  },
  exact(c) {
    tone(c, { freq: 660, duration: 0.09, type: "triangle", gain: 0.22 });
    tone(c, { freq: 990, duration: 0.14, type: "triangle", gain: 0.22, delay: 0.06 });
    tone(c, { freq: 1320, duration: 0.18, type: "sine", gain: 0.16, delay: 0.12 });
  },
  live(c) {
    tone(c, { freq: 500, duration: 0.07, type: "sawtooth", gain: 0.14 });
    tone(c, { freq: 500, duration: 0.07, type: "sawtooth", gain: 0.14, delay: 0.1 });
  },
  hot(c) {
    tone(c, { freq: 420, freqEnd: 640, duration: 0.22, type: "sawtooth", gain: 0.13 });
  },
  dead(c) {
    noiseBurst(c, { duration: 0.18, gain: 0.1, filterFreq: 400 });
    tone(c, { freq: 160, duration: 0.16, type: "sine", gain: 0.1 });
  },
  duplicate(c) {
    tone(c, { freq: 260, duration: 0.08, type: "square", gain: 0.1 });
  },
  complete(c) {
    [523, 659, 784, 1046].forEach((freq, i) => {
      tone(c, { freq, duration: 0.16, type: "triangle", gain: 0.2, delay: i * 0.09 });
    });
  },
  warning(c) {
    tone(c, { freq: 300, duration: 0.1, type: "square", gain: 0.16 });
    tone(c, { freq: 300, duration: 0.1, type: "square", gain: 0.16, delay: 0.16 });
  },
  victory(c) {
    [523, 659, 784, 1046, 1318].forEach((freq, i) => {
      tone(c, { freq, duration: 0.3, type: "triangle", gain: 0.2, delay: i * 0.1 });
    });
  },
  defeat(c) {
    [392, 349, 311, 262].forEach((freq, i) => {
      tone(c, { freq, duration: 0.35, type: "sine", gain: 0.18, delay: i * 0.14 });
    });
  },
};

export function play(name, delay = 0) {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;
  const fn = EFFECTS[name];
  if (!fn) return;
  try {
    if (delay > 0) {
      setTimeout(() => fn(c), delay * 1000);
    } else {
      fn(c);
    }
  } catch (err) {
    // Audio is optional; never let a synthesis error break gameplay.
  }
}

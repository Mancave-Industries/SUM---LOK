/* ==========================================================================
   THE DECEIVERS — Sound
   A synthesized (WebAudio, no audio files) sound design matching the dark
   ceremonial theme: bell tolls, low drones, bright coin chimes, dark/bright
   resolving chords for the two endings. Entirely self-contained — main.js
   only ever calls Sound.setEnabled(bool) and Sound.play(name).

   Anonymity note: during the Murder phase's per-player turn queue, the
   *same* device that's passed hand to hand plays these sounds out loud for
   the whole table to hear — not just the person holding it. So every turn
   in that queue (tap-murder-turn / confirm-murder-turn) must play an
   identical sound regardless of whether that player is the acting
   Deceiver, exactly mirroring the on-screen decoy. The distinctive
   "something happened" sounds only ever play once everyone is already
   gathered around for the reveal, where audibility is no longer a leak.
   ========================================================================== */

const Sound = (() => {
  let enabled = false;
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setEnabled(value) {
    enabled = !!value;
  }

  /* ---------- Primitives ---------- */

  function envTone(freq, { type = 'sine', start = 0, dur = 0.18, peak = 0.16, attack = 0.012, endFreq = null } = {}) {
    const c = getCtx();
    const t0 = c.currentTime + start;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /* Two slightly-detuned oscillators for a warmer/bell-like beating tone. */
  function bellTone(freq, { start = 0, dur = 1.1, peak = 0.15 } = {}) {
    const c = getCtx();
    const t0 = c.currentTime + start;
    [1, 1.006, 2.003].forEach((mult, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * mult, t0);
      const p = peak * (i === 2 ? 0.25 : 1);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(p, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    });
  }

  function noiseBurst({ start = 0, dur = 0.12, peak = 0.22, filterFreq = 800, filterType = 'lowpass', filterQ = 1 } = {}) {
    const c = getCtx();
    const t0 = c.currentTime + start;
    const bufferSize = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function chord(freqs, opts = {}) {
    freqs.forEach((f, i) => envTone(f, { ...opts, start: (opts.start || 0) + i * (opts.stagger || 0) }));
  }

  /* ---------- Named cues ---------- */

  const cues = {
    // Generic UI navigation click — quiet, brief, used everywhere that
    // doesn't have a more specific cue of its own.
    tap: () => envTone(1180, { type: 'sine', dur: 0.05, peak: 0.05, attack: 0.004 }),

    // Opening a private role card: a mysterious rising interval.
    reveal: () => chord([220, 293.66], { type: 'sine', dur: 0.16, peak: 0.13, stagger: 0.09, attack: 0.01 }),
    // Hiding it again / closing a private screen: the same interval falling.
    hide: () => chord([293.66, 220], { type: 'sine', dur: 0.14, peak: 0.1, stagger: 0.07, attack: 0.008 }),

    // Drawing a card: a light paper-flip tick.
    draw: () => {
      noiseBurst({ dur: 0.05, peak: 0.08, filterFreq: 2200, filterType: 'highpass' });
      envTone(329.63, { type: 'triangle', dur: 0.1, peak: 0.1, attack: 0.006, start: 0.02 });
    },
    // Gold landing in the Prize Pot: a bright ascending coin arpeggio.
    gold: () => {
      noiseBurst({ dur: 0.04, peak: 0.1, filterFreq: 3500, filterType: 'highpass' });
      chord([523.25, 659.25, 783.99], { type: 'triangle', dur: 0.14, peak: 0.11, stagger: 0.05, attack: 0.006 });
    },

    // Night falls: a low ominous drone swelling in and fading out.
    nightFalls: () => {
      const c = getCtx();
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = 110;
      lfo.type = 'sine';
      lfo.frequency.value = 4.5;
      lfoGain.gain.value = 3;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      lfo.start(t0);
      osc.stop(t0 + 1.6);
      lfo.stop(t0 + 1.6);
    },

    // The ceremonial ready-bell — reused for "Seal the Roles & Begin",
    // "Next Game", and the Elimination Reveal's "Gather Everyone" moment.
    gather: () => bellTone(293.66, { dur: 1.2, peak: 0.14 }),

    // Quiet Night outcome: soft, warm, relieved.
    quietNight: () => chord([440, 523.25], { type: 'sine', dur: 0.45, peak: 0.1, stagger: 0.09, attack: 0.02 }),
    // A Shield blocked the Murder: bright protective shimmer.
    shieldSaved: () => chord([523.25, 659.25, 783.99], { type: 'triangle', dur: 0.22, peak: 0.12, stagger: 0.055, attack: 0.008 }),
    // Someone was murdered: a dark descending tone under a soft thud.
    murdered: () => {
      noiseBurst({ dur: 0.14, peak: 0.16, filterFreq: 400, filterType: 'lowpass' });
      envTone(293.66, { type: 'triangle', dur: 0.9, peak: 0.13, endFreq: 146.83, attack: 0.01 });
    },

    // The vote was tied: a single flat, anticlimactic knock — no melody.
    tie: () => noiseBurst({ dur: 0.16, peak: 0.14, filterFreq: 260, filterType: 'lowpass' }),
    // Someone was banished: a sharper gavel-knock under a falling tone.
    banished: () => {
      noiseBurst({ dur: 0.1, peak: 0.24, filterFreq: 900, filterType: 'bandpass', filterQ: 2 });
      envTone(196, { type: 'sawtooth', dur: 0.4, peak: 0.1, endFreq: 130.81, attack: 0.008 });
    },

    // Endings: dark minor chord for the Deceivers, bright major for Loyal.
    deceiverWin: () => chord([110, 220, 261.63, 329.63], { type: 'sawtooth', dur: 1.4, peak: 0.09, stagger: 0.05, attack: 0.02 }),
    loyalWin: () => chord([220, 277.18, 329.63, 440], { type: 'triangle', dur: 1.3, peak: 0.1, stagger: 0.05, attack: 0.02 }),

    modalOpen: () => chord([440, 523.25], { type: 'sine', dur: 0.09, peak: 0.06, stagger: 0.045, attack: 0.006 }),
    modalClose: () => chord([523.25, 440], { type: 'sine', dur: 0.08, peak: 0.05, stagger: 0.04, attack: 0.006 }),
  };

  function play(name, delay = 0) {
    if (!enabled) return;
    const cue = cues[name];
    if (!cue) return;
    try {
      if (delay > 0) {
        setTimeout(() => { try { cue(); } catch (e) { /* ignore */ } }, delay * 1000);
      } else {
        cue();
      }
    } catch (e) {
      /* WebAudio unsupported or blocked — silently skip */
    }
  }

  return { setEnabled, play };
})();

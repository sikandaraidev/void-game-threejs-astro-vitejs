/**
 * Procedural audio via Web Audio. Zero download, instant feedback (Doherty threshold).
 * Simple stereo placement by lateral offset; full spatial audio arrives with the art pass.
 */
export type Sfx =
  | 'missileFire'
  | 'pickup'
  | 'wingsOpen'
  | 'pilotFire'
  | 'turretFire'
  | 'enemyFire'
  | 'hit'
  | 'kill'
  | 'bigKill'
  | 'shieldHit'
  | 'hullHit'
  | 'overheat'
  | 'jump';

export interface Audio {
  /** Must be called from a user gesture (browser autoplay policy). */
  start(): void;
  play(sfx: Sfx, pan?: number, intensity?: number): void;
  /** 0..1 engine intensity (speed). */
  engine(level: number): void;
  setPaused(paused: boolean): void;
}

const MIN_GAP: Record<Sfx, number> = {
  pilotFire: 0.06,
  turretFire: 0.05,
  enemyFire: 0.08,
  hit: 0.03,
  kill: 0.04,
  bigKill: 0.5,
  shieldHit: 0.08,
  hullHit: 0.08,
  overheat: 0.5,
  jump: 1,
  missileFire: 0.08,
  pickup: 0.1,
  wingsOpen: 0.3,
};

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let engineGain: GainNode | null = null;
  let engineFilter: BiquadFilterNode | null = null;
  const last = new Map<Sfx, number>();

  function out(pan: number): AudioNode | null {
    if (!ctx || !master) return null;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(master);
    return p;
  }

  function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, pan: number): void {
    if (!ctx) return;
    const dest = out(pan);
    if (!dest) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function burst(dur: number, vol: number, freq: number, pan: number, sweepTo = freq * 0.3): void {
    if (!ctx || !noise) return;
    const dest = out(pan);
    if (!dest) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  return {
    start() {
      if (ctx) return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.45;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      // Engine drone: two detuned saws through a lowpass that opens with speed.
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 180;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.05;
      for (const f of [55, 55.7, 82.4]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(engineFilter);
        o.start();
      }
      engineFilter.connect(engineGain).connect(master);
    },
    play(sfx, pan = 0, intensity = 1) {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (now - (last.get(sfx) ?? -1) < MIN_GAP[sfx]) return;
      last.set(sfx, now);
      switch (sfx) {
        case 'pilotFire':
          tone('square', 880, 160, 0.09, 0.07, pan);
          break;
        case 'turretFire':
          tone('sawtooth', 1300, 300, 0.06, 0.05, pan);
          break;
        case 'enemyFire':
          tone('triangle', 300, 520, 0.18, 0.05 * intensity, pan);
          break;
        case 'hit':
          tone('square', 1800, 900, 0.04, 0.035, pan);
          break;
        case 'kill':
          burst(0.45, 0.5 * intensity, 2400, pan);
          tone('sine', 140, 40, 0.35, 0.25 * intensity, pan);
          break;
        case 'bigKill':
          burst(2.2, 0.9, 3000, pan, 60);
          tone('sine', 90, 25, 2, 0.5, pan);
          break;
        case 'shieldHit':
          tone('sine', 520, 260, 0.2, 0.18, pan);
          burst(0.15, 0.2, 5000, pan);
          break;
        case 'hullHit':
          burst(0.35, 0.6, 900, pan, 100);
          tone('square', 110, 50, 0.25, 0.2, pan);
          break;
        case 'overheat':
          tone('sawtooth', 600, 120, 0.6, 0.12, pan);
          break;
        case 'jump':
          burst(3.5, 0.6, 300, 0, 8000);
          tone('sine', 60, 900, 3, 0.3, 0);
          break;
        case 'missileFire':
          burst(0.5, 0.25, 4000, pan, 600);
          tone('sawtooth', 220, 660, 0.35, 0.06, pan);
          break;
        case 'pickup':
          tone('sine', 660, 1320, 0.18, 0.18, pan);
          tone('triangle', 990, 1980, 0.25, 0.1, pan);
          break;
        case 'wingsOpen':
          tone('sawtooth', 90, 260, 0.7, 0.08 * intensity, pan);
          break;
      }
    },
    engine(level) {
      if (!ctx || !engineFilter || !engineGain) return;
      const t = ctx.currentTime;
      engineFilter.frequency.setTargetAtTime(160 + level * 900, t, 0.15);
      engineGain.gain.setTargetAtTime(0.04 + level * 0.05, t, 0.2);
    },
    setPaused(paused) {
      if (!ctx) return;
      void (paused ? ctx.suspend() : ctx.resume());
    },
  };
}

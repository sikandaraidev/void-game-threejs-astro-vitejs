import type { DifficultySettings } from '../sim/difficulty';
import type { FromSim, Seat, SeatInput, Snapshot, ToSim } from '../sim/types';

/**
 * The seam between the game client and wherever the simulation runs.
 * Phase 1: LocalTransport (sim in a Web Worker on this machine).
 * Phase 2: WebRTCTransport (sim on the host's machine), same interface, game code unchanged.
 */
export interface Transport {
  sendInput(seat: Seat, input: SeatInput): void;
  setHuman(seat: Seat, human: boolean): void;
  reset(seed: number, difficulty: DifficultySettings): void;
  pause(paused: boolean): void;
  onSnapshot(listener: (snapshot: Snapshot) => void): void;
  dispose(): void;
}

export function createLocalTransport(): Transport {
  const worker = new Worker(new URL('../sim/sim.worker.ts', import.meta.url), { type: 'module' });
  const listeners: ((s: Snapshot) => void)[] = [];
  const send = (msg: ToSim): void => worker.postMessage(msg);

  worker.onmessage = (ev: MessageEvent<FromSim>) => {
    if (ev.data.type === 'snapshot') for (const l of listeners) l(ev.data.snapshot);
  };

  return {
    sendInput: (seat, input) => send({ type: 'input', seat, input }),
    setHuman: (seat, human) => send({ type: 'control', seat, human }),
    reset: (seed, difficulty) => send({ type: 'reset', seed, difficulty }),
    pause: (paused) => send({ type: 'pause', paused }),
    onSnapshot: (l) => listeners.push(l),
    dispose: () => worker.terminate(),
  };
}

/// <reference lib="webworker" />
import { DT } from './constants';
import type { FromSim, SimEvent, ToSim } from './types';
import { createWorld, snapshotOf, stepWorld, type World } from './world';

/**
 * Host simulation: fixed 60 Hz step, decoupled from rendering.
 * In co-op (Phase 2) this same worker runs on the host's machine.
 */
declare const self: DedicatedWorkerGlobalScope;

let world: World = createWorld(1);
let paused = false;
let last = performance.now();
let acc = 0;

function post(events: SimEvent[]): void {
  const snapshot = snapshotOf(world);
  snapshot.events = events;
  const msg: FromSim = { type: 'snapshot', snapshot };
  self.postMessage(msg, [snapshot.enemies.buffer, snapshot.playerBullets.buffer, snapshot.enemyBolts.buffer]);
}

function loop(): void {
  const now = performance.now();
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!paused) {
    let stepped = false;
    const events: SimEvent[] = [];
    while (acc >= DT) {
      stepWorld(world);
      acc -= DT;
      stepped = true;
      for (const e of world.events) events.push(e); // never drop events between posts
    }
    if (stepped) post(events);
  } else {
    acc = 0;
  }
  setTimeout(loop, 4);
}

self.onmessage = (ev: MessageEvent<ToSim>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'input':
      world.inputs[msg.seat] = msg.input;
      break;
    case 'control':
      world.humans[msg.seat] = msg.human;
      break;
    case 'reset':
      world = createWorld(msg.seed, world.humans);
      acc = 0;
      last = performance.now();
      break;
    case 'pause':
      paused = msg.paused;
      last = performance.now();
      break;
  }
};

loop();

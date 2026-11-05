import type { Seat, Snapshot } from '../../sim/types';
import { setCssVar } from '../cssVar';
import { cls, el } from '../dom';
import styles from './hud.module.css';

export const ZONE_NAMES = ['The Lantern Reach', 'Ashfall Drift', 'The Quiet Shelf'] as const;
export const DESTINATION_NAME = 'The Warden';

export interface Hud {
  setVisible(visible: boolean): void;
  setSeat(seat: Seat): void;
  update(s: Snapshot, mouseX: number, mouseY: number, locked: boolean): void;
  hint(text: string, seconds?: number): void;
  damage(amount: number): void;
  flash(amount: number): void;
  tick(dt: number): void;
}

function meter(parent: HTMLElement, label: string, extra?: string) {
  const root = el('div', cls(styles.meter, extra), undefined, parent);
  const text = el('span', undefined, label, root);
  const bar = el('div', styles.bar, undefined, root);
  el('div', styles.barFill, undefined, bar);
  return { root, text, bar };
}

export function createHud(parent: HTMLElement): Hud {
  const root = el('div', styles.hud, undefined, parent);
  root.dataset.visible = 'false';
  root.setAttribute('aria-hidden', 'true');

  const damageLayer = el('div', styles.damage, undefined, root);
  const flashLayer = el('div', styles.flash, undefined, root);

  const progress = el('div', styles.progress, undefined, root);
  const progressLabel = el('span', styles.progressLabel, '', progress);
  const track = el('div', styles.track, undefined, progress);
  const fill = el('div', styles.trackFill, undefined, track);
  el('div', cls(styles.tick, styles.tickA), undefined, track);
  el('div', cls(styles.tick, styles.tickB), undefined, track);
  el('div', cls(styles.tick, styles.tickDest), undefined, track);
  const bossLabel = el('span', styles.bossLabel, '', progress);
  bossLabel.dataset.visible = 'false';

  const seatBox = el('div', styles.seat, undefined, root);
  const seatName = el('span', styles.seatName, '', seatBox);
  const seatSwap = el('span', styles.dim, '', seatBox);

  const score = el('div', styles.score, '0', root);

  const vitals = el('div', styles.vitals, undefined, root);
  const hull = meter(vitals, 'Hull');
  const shield = meter(vitals, 'Shield', styles.shield);

  const role = el('div', styles.role, undefined, root);
  const roleMeter = meter(role, 'Boost');

  const reticle = el('div', styles.reticle, undefined, root);
  const hintEl = el('div', styles.hint, '', root);
  hintEl.setAttribute('role', 'status');

  let seat: Seat = 'pilot';
  let hintTime = 0;
  let hit = 0;
  let flash = 0;
  // Only touch the DOM when a value changes.
  let lastScore = -1;
  let lastLabel = '';
  let lastBoss = '';

  return {
    setVisible(visible) {
      root.dataset.visible = String(visible);
    },
    setSeat(next) {
      seat = next;
      seatName.textContent = next === 'pilot' ? 'Pilot' : 'Gunner';
      seatSwap.textContent = next === 'pilot' ? 'Tab · take gunner' : 'Tab · take pilot';
      roleMeter.text.textContent = next === 'pilot' ? 'Boost' : 'Turret heat';
    },
    update(s, mouseX, mouseY, locked) {
      setCssVar(fill, '--fill', s.progress.toFixed(4));

      const label =
        s.phase === 'run'
          ? `Zone ${s.zone + 1} / 3 · ${ZONE_NAMES[s.zone] ?? ''}`
          : s.phase === 'boss'
            ? `Destination · ${DESTINATION_NAME}`
            : s.phase === 'jump' || s.phase === 'won'
              ? 'Jump'
              : 'Signal lost';
      if (label !== lastLabel) {
        progressLabel.textContent = label;
        lastLabel = label;
      }

      const nodesLeft = s.boss ? s.boss.nodes.filter((h) => h > 0).length : 0;
      const bossText = s.phase === 'boss' ? `Destroy the amber nodes · ${nodesLeft} left` : '';
      if (bossText !== lastBoss) {
        bossLabel.textContent = bossText;
        bossLabel.dataset.visible = String(bossText !== '');
        lastBoss = bossText;
      }

      if (s.score !== lastScore) {
        score.textContent = s.score.toLocaleString('en-US');
        lastScore = s.score;
      }

      setCssVar(hull.bar, '--v', (s.hull / 100).toFixed(3));
      hull.root.dataset.low = String(s.hull < 30);
      setCssVar(shield.bar, '--v', (s.shield / 100).toFixed(3));

      if (seat === 'pilot') {
        setCssVar(roleMeter.bar, '--v', (s.boost / 100).toFixed(3));
        roleMeter.root.dataset.hot = 'false';
      } else {
        setCssVar(roleMeter.bar, '--v', s.heat.toFixed(3));
        roleMeter.root.dataset.hot = String(s.overheated);
        roleMeter.text.textContent = s.overheated ? 'Turret overheated' : 'Turret heat';
      }

      setCssVar(reticle, '--x', mouseX.toFixed(4));
      setCssVar(reticle, '--y', mouseY.toFixed(4));
      // Amber ring = a target is locked: shots will lead it.
      reticle.dataset.locked = String(locked);
    },
    hint(text, seconds = 5) {
      hintEl.textContent = text;
      hintEl.dataset.visible = 'true';
      hintTime = seconds;
    },
    damage(amount) {
      hit = Math.min(1, hit + amount);
    },
    flash(amount) {
      flash = Math.max(flash, amount);
    },
    tick(dt) {
      if (hintTime > 0) {
        hintTime -= dt;
        if (hintTime <= 0) hintEl.dataset.visible = 'false';
      }
      if (hit > 0) {
        hit = Math.max(0, hit - dt * 2.2);
        setCssVar(damageLayer, '--hit', hit.toFixed(3));
      }
      if (flash > 0) {
        flash = Math.max(0, flash - dt * 0.9);
        setCssVar(flashLayer, '--flash', flash.toFixed(3));
      }
    },
  };
}

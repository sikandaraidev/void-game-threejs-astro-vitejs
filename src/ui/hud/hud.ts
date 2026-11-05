import { SHIELD_MAX } from '../../sim/constants';
import { SEATS, type Seat, type Snapshot } from '../../sim/types';
import { setCssVar } from '../cssVar';
import { cls, el } from '../dom';
import styles from './hud.module.css';

export const ZONE_NAMES = ['The Lantern Reach', 'Ashfall Drift', 'The Quiet Shelf'] as const;
export const DESTINATION_NAME = 'The Ossuary';
const SEAT_LABEL: Record<Seat, string> = { pilot: 'Pilot', dorsal: 'Dorsal gun', ventral: 'Ventral gun' };

export interface Hud {
  setVisible(visible: boolean): void;
  setSeat(seat: Seat): void;
  update(s: Snapshot, reticleX: number, reticleY: number, locked: boolean): void;
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

  // Top centre: run progress (Goal-Gradient).
  const progress = el('div', styles.progress, undefined, root);
  const progressLabel = el('span', styles.progressLabel, '', progress);
  const track = el('div', styles.track, undefined, progress);
  const fill = el('div', styles.trackFill, undefined, track);
  el('div', cls(styles.tick, styles.tickA), undefined, track);
  el('div', cls(styles.tick, styles.tickB), undefined, track);
  el('div', cls(styles.tick, styles.tickDest), undefined, track);
  const bossLabel = el('span', styles.bossLabel, '', progress);
  bossLabel.dataset.visible = 'false';

  // Top left: crew panel (Common Region; recognition over recall: the keys are shown).
  const crew = el('div', styles.crew, undefined, root);
  const seatRows = SEATS.map((seat, i) => {
    const row = el('div', styles.crewRow, undefined, crew);
    el('span', styles.key, String(i + 1), row);
    el('span', styles.crewName, SEAT_LABEL[seat], row);
    const who = el('span', styles.crewWho, 'Bot', row);
    return { seat, row, who };
  });
  el('span', styles.dim, 'C · outside view', crew);

  const score = el('div', styles.score, '0', root);

  // Bottom left: shared ship vitals.
  const vitals = el('div', styles.vitals, undefined, root);
  const hull = meter(vitals, 'Hull');
  const shield = meter(vitals, 'Shield', styles.shield);

  // Bottom right: only YOUR station's meter (Cognitive Load).
  const role = el('div', styles.role, undefined, root);
  const roleMeter = meter(role, 'Boost');

  // Bottom centre: active power-ups.
  const buffs = el('div', styles.buffs, undefined, root);
  const buffChips = {
    overcharge: el('span', cls(styles.chip, styles.chipHot), '', buffs),
    coolant: el('span', cls(styles.chip, styles.chipCold), '', buffs),
    pulse: el('span', cls(styles.chip, styles.chipSignal), '', buffs),
    missiles: el('span', cls(styles.chip, styles.chipMissile), '', buffs),
  };

  const reticle = el('div', styles.reticle, undefined, root);
  const hintEl = el('div', styles.hint, '', root);
  hintEl.setAttribute('role', 'status');

  let seat: Seat = 'pilot';
  let hintTime = 0;
  let hit = 0;
  let flash = 0;
  let lastScore = -1;
  let lastLabel = '';
  let lastBoss = '';

  const chip = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
    node.dataset.visible = String(text !== '');
  };

  return {
    setVisible(visible) {
      root.dataset.visible = String(visible);
    },
    setSeat(next) {
      seat = next;
      reticle.dataset.mode = next === 'pilot' ? 'free' : 'center';
      for (const r of seatRows) r.row.dataset.active = String(r.seat === next);
    },
    update(s, reticleX, reticleY, locked) {
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
      const hearts = s.boss ? s.boss.nodes.filter((h) => h > 0).length : 0;
      const bossText = s.phase === 'boss' ? `Destroy the amber hearts · ${hearts} left` : '';
      if (bossText !== lastBoss) {
        bossLabel.textContent = bossText;
        bossLabel.dataset.visible = String(bossText !== '');
        lastBoss = bossText;
      }
      if (s.score !== lastScore) {
        score.textContent = s.score.toLocaleString('en-US');
        lastScore = s.score;
      }

      for (const r of seatRows) {
        const text = r.seat === seat ? 'You' : s.humans[r.seat] ? 'Crew' : 'Bot';
        if (r.who.textContent !== text) r.who.textContent = text;
      }

      setCssVar(hull.bar, '--v', (s.hull / 100).toFixed(3));
      hull.root.dataset.low = String(s.hull < 30);
      setCssVar(shield.bar, '--v', (s.shield / SHIELD_MAX).toFixed(3));

      if (seat === 'pilot') {
        roleMeter.text.textContent = 'Boost';
        setCssVar(roleMeter.bar, '--v', (s.boost / 100).toFixed(3));
        roleMeter.root.dataset.hot = 'false';
      } else {
        const t = s.turrets[seat];
        roleMeter.text.textContent =
          s.buffs.coolant > 0 ? 'Coolant active' : t.overheated ? 'Overheated' : 'Barrel heat';
        setCssVar(roleMeter.bar, '--v', t.heat.toFixed(3));
        roleMeter.root.dataset.hot = String(t.overheated);
      }

      chip(
        buffChips.overcharge,
        s.buffs.overcharge > 0 ? `Overcharge ${Math.ceil(s.buffs.overcharge)}s` : '',
      );
      chip(buffChips.coolant, s.buffs.coolant > 0 ? `Coolant ${Math.ceil(s.buffs.coolant)}s` : '');
      chip(buffChips.pulse, s.buffs.pulse > 0 ? `Pulse ${Math.ceil(s.buffs.pulse)}s` : '');
      chip(buffChips.missiles, s.buffs.missiles > 0 ? `Missiles ×${s.buffs.missiles}` : '');

      setCssVar(reticle, '--x', reticleX.toFixed(4));
      setCssVar(reticle, '--y', reticleY.toFixed(4));
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

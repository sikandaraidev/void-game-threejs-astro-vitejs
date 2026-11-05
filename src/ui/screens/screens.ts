import {
  DIFFICULTY_LABELS,
  DIFFICULTY_PRESETS,
  DIFFICULTY_RANGES,
  clampSettings,
  type DifficultyName,
  type DifficultySettings,
} from '../../sim/difficulty';
import { cls, el } from '../dom';
import styles from './screens.module.css';

export type ScreenKind = 'start' | 'pause' | 'end' | 'rest' | 'controls' | 'none';

export interface EndData {
  won: boolean;
  score: number;
  kills: number;
  seconds: number;
}

export interface ScreenHandlers {
  onLaunch(difficulty: DifficultySettings): void;
  onResume(): void;
  onRestart(): void;
  onRest(): void;
  onHome(): void;
}

export interface Screens {
  show(kind: ScreenKind, data?: EndData): void;
  readonly current: ScreenKind;
  readonly difficulty: DifficultySettings;
}

const STORE_KEY = 'void.difficulty.v1';

interface Stored {
  name: DifficultyName;
  custom: DifficultySettings;
}

function load(): Stored {
  const fallback: Stored = { name: 'standard', custom: { ...DIFFICULTY_PRESETS.standard } };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const name = parsed.name && parsed.name in DIFFICULTY_LABELS ? parsed.name : 'standard';
    return { name, custom: clampSettings({ ...fallback.custom, ...(parsed.custom ?? {}) }) };
  } catch {
    return fallback;
  }
}

function save(s: Stored): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode): the choice simply isn't remembered.
  }
}

/**
 * Hick's law: the start screen has ONE primary action; difficulty sits beneath it with a sensible
 * default. Pause ≤ 4 actions, primary first, Rest last (Serial Position). Peak-End: the end card is
 * calm and dignified, win or lose. "Rest" is a first-class choice.
 */
export function createScreens(parent: HTMLElement, h: ScreenHandlers): Screens {
  const layer = el('div', styles.layer, undefined, parent);
  layer.dataset.open = 'false';
  let current: ScreenKind = 'none';
  let previous: ScreenKind = 'none';
  const stored = load();

  const settings = (): DifficultySettings =>
    stored.name === 'custom' ? clampSettings(stored.custom) : DIFFICULTY_PRESETS[stored.name];

  const panel = (): HTMLElement => {
    layer.replaceChildren();
    const p = el('section', styles.panel, undefined, layer);
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'true');
    return p;
  };

  const button = (
    parentEl: HTMLElement,
    label: string,
    onClick: () => void,
    primary = false,
  ): HTMLButtonElement => {
    const b = el('button', cls(styles.button, primary ? styles.primary : undefined), label, parentEl);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };

  const stat = (parentEl: HTMLElement, label: string, value: string): void => {
    const s = el('div', styles.stat, undefined, parentEl);
    el('dt', styles.statLabel, label, s);
    el('dd', styles.statValue, value, s);
  };

  const renderDifficulty = (p: HTMLElement): void => {
    const box = el('fieldset', styles.difficulty, undefined, p);
    el('legend', styles.small, 'Difficulty', box);
    const seg = el('div', styles.segmented, undefined, box);
    const customBox = el('div', styles.sliders, undefined, box);
    const names = Object.keys(DIFFICULTY_LABELS) as DifficultyName[];
    for (const name of names) {
      const label = el('label', styles.segment, undefined, seg);
      const input = el('input', undefined, undefined, label);
      input.type = 'radio';
      input.name = 'difficulty';
      input.value = name;
      input.checked = stored.name === name;
      el('span', undefined, DIFFICULTY_LABELS[name], label);
      input.addEventListener('change', () => {
        stored.name = name;
        save(stored);
        customBox.dataset.open = String(name === 'custom');
      });
    }
    customBox.dataset.open = String(stored.name === 'custom');
    for (const key of Object.keys(DIFFICULTY_RANGES) as (keyof DifficultySettings)[]) {
      const range = DIFFICULTY_RANGES[key];
      const row = el('label', styles.slider, undefined, customBox);
      el('span', undefined, range.label, row);
      const input = el('input', undefined, undefined, row);
      input.type = 'range';
      input.min = String(range.min);
      input.max = String(range.max);
      input.step = String(range.step);
      input.value = String(stored.custom[key]);
      const out = el('output', undefined, Number(stored.custom[key]).toFixed(2), row);
      input.addEventListener('input', () => {
        stored.custom[key] = Number(input.value);
        out.textContent = Number(input.value).toFixed(2);
        save(stored);
      });
    }
  };

  const renderControls = (p: HTMLElement): void => {
    const dl = el('dl', styles.controls, undefined, p);
    const rows: [string, string][] = [
      ['1 · 2 · 3', 'Take the pilot, dorsal or ventral seat'],
      ['Tab', 'Next seat'],
      ['W A S D', 'Steer (pilot)'],
      ['Mouse', 'Aim (pilot) · turn the turret (gunner)'],
      ['Click / Space', 'Fire'],
      ['Shift · X', 'Boost · brake (pilot)'],
      ['C', 'Cockpit / outside view'],
      ['Esc', 'Pause'],
      ['H', 'This sheet'],
    ];
    for (const [k, v] of rows) {
      el('dt', undefined, k, dl);
      el('dd', undefined, v, dl);
    }
    el('p', styles.small, 'Fly through or shoot salvage pods to collect power-ups.', p);
  };

  const api: Screens = {
    get current() {
      return current;
    },
    get difficulty() {
      return settings();
    },
    show(kind, data) {
      if (kind === 'controls' && current !== 'controls') previous = current;
      current = kind;
      layer.dataset.open = String(kind !== 'none');
      if (kind === 'none') {
        layer.replaceChildren();
        return;
      }
      const p = panel();
      let focus: HTMLButtonElement | null = null;

      switch (kind) {
        case 'start': {
          el('h1', styles.title, 'VOID', p);
          el(
            'p',
            styles.lede,
            'Beyond the last light, something is calling. Crew the VESPER and answer it.',
            p,
          );
          const actions = el('div', styles.actions, undefined, p);
          focus = button(actions, 'Launch', () => h.onLaunch(settings()), true);
          renderDifficulty(p);
          el('p', styles.small, '1 · 2 · 3 change seat · bots crew the others · H for controls', p);
          break;
        }
        case 'pause': {
          el('h2', styles.heading, 'Paused', p);
          const actions = el('div', styles.actions, undefined, p);
          focus = button(actions, 'Resume', h.onResume, true);
          button(actions, 'Controls', () => api.show('controls'));
          button(actions, 'Rest', h.onRest);
          break;
        }
        case 'controls': {
          el('h2', styles.heading, 'Controls', p);
          renderControls(p);
          const actions = el('div', styles.actions, undefined, p);
          focus = button(actions, 'Back', () => api.show(previous === 'controls' ? 'none' : previous), true);
          break;
        }
        case 'end': {
          const won = data?.won ?? false;
          const heading = el('h2', styles.heading, won ? 'Jump complete' : 'Ship lost', p);
          heading.dataset.tone = won ? 'normal' : 'signal';
          el(
            'p',
            styles.lede,
            won
              ? 'The Ossuary falls silent. Its last signal points further out, past the edge of the map.'
              : 'The drift carried you home. The signal is still out there, and it is still calling.',
            p,
          );
          const stats = el('dl', styles.stats, undefined, p);
          stat(stats, 'Score', (data?.score ?? 0).toLocaleString('en-US'));
          stat(stats, 'Kills', String(data?.kills ?? 0));
          const secs = Math.round(data?.seconds ?? 0);
          stat(stats, 'Time', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
          const actions = el('div', styles.actions, undefined, p);
          focus = button(actions, won ? 'Jump again' : 'Try again', h.onRestart, true);
          button(actions, 'Rest', h.onRest);
          break;
        }
        case 'rest': {
          el('h2', styles.heading, 'Rest well', p);
          el('p', styles.lede, 'The void will wait. Come back when you want to feel small again.', p);
          const actions = el('div', styles.actions, undefined, p);
          focus = button(actions, 'Back to the hangar', h.onHome, true);
          break;
        }
      }
      focus?.focus();
    },
  };
  return api;
}

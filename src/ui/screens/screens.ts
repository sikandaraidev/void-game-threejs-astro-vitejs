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
  onLaunch(): void;
  onResume(): void;
  onRestart(): void;
  onRest(): void;
  onHome(): void;
}

export interface Screens {
  show(kind: ScreenKind, data?: EndData): void;
  readonly current: ScreenKind;
}

/**
 * Hick's law: the start screen has ONE action. Pause ≤ 4 actions, primary first, Rest last (Serial Position).
 * Peak-End: the end card is calm and dignified, win or lose. "Rest" is a first-class choice.
 */
export function createScreens(parent: HTMLElement, h: ScreenHandlers): Screens {
  const layer = el('div', styles.layer, undefined, parent);
  layer.dataset.open = 'false';
  let current: ScreenKind = 'none';
  let previous: ScreenKind = 'none';

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

  const renderControls = (p: HTMLElement): void => {
    const dl = el('dl', styles.controls, undefined, p);
    const rows: [string, string][] = [
      ['W A S D', 'Steer (pilot)'],
      ['Mouse', 'Aim'],
      ['Click / Space', 'Fire'],
      ['Shift', 'Boost (pilot)'],
      ['X', 'Brake (pilot)'],
      ['Tab', 'Swap seat with the bot'],
      ['Esc', 'Pause'],
      ['H', 'This sheet'],
    ];
    for (const [k, v] of rows) {
      el('dt', undefined, k, dl);
      el('dd', undefined, v, dl);
    }
  };

  const api: Screens = {
    get current() {
      return current;
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
            'Beyond the last light, something is calling. Take the ship and answer it.',
            p,
          );
          const actions = el('div', styles.actions, undefined, p);
          focus = button(actions, 'Launch', h.onLaunch, true);
          el('p', styles.small, 'Solo with a bot gunner · Tab swaps seats · H for controls', p);
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
              ? 'The Warden falls silent. Its last signal points further out, past the edge of the map.'
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

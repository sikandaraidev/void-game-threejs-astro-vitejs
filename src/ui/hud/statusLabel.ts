import styles from './statusLabel.module.css';

export interface StatusLabel {
  set(text: string, tone?: 'normal' | 'signal'): void;
  dispose(): void;
}

export function createStatusLabel(parent: HTMLElement): StatusLabel {
  const el = document.createElement('p');
  el.className = styles.label ?? '';
  el.setAttribute('role', 'status');
  parent.append(el);
  return {
    set(text, tone = 'normal') {
      el.textContent = text;
      el.dataset.tone = tone;
    },
    dispose() {
      el.remove();
    },
  };
}

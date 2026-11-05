/** Tiny DOM builder: class names from CSS Modules, text via textContent (never innerHTML). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string | undefined,
  text?: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}

export function cls(...names: (string | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

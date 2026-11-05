/**
 * The ONE audited exception to the no-inline-styles rule (Blueprint v1 §7).
 * Per-frame values (gauge fills, reticle positions) are passed as CSS custom properties;
 * all actual styling stays in CSS Modules.
 */
const CSS_VAR = /^--[a-z][a-z0-9-]*$/;

export function setCssVar(el: HTMLElement, name: string, value: string | number): void {
  if (!CSS_VAR.test(name)) throw new Error(`setCssVar: invalid custom property "${name}"`);
  // eslint-disable-next-line no-restricted-syntax -- audited helper, custom properties only
  el.style.setProperty(name, String(value));
}

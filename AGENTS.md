# AGENTS.md: rules for AI assistants working on VOID

Read in this order before changing anything:

1. `../Project VOID — Blueprint v3.md`: the single source of truth (vision, decisions, roadmap).
2. `../docs/laws-of-ux.md`: **all 30 laws are a hard requirement.** Every screen and HUD element must map to Blueprint v3 §8.
3. `docs/techniques/`: one file per rendering or netcode technique.

## Hard constraints

- TypeScript strict. No `any`; no non-null `!` assertions.
- **No inline styles, no `style=`, no `!important`, no `innerHTML`.** Styling goes through CSS Modules + tokens (`src/styles/tokens.css`) + `@layer`. Per-frame values go through `setCssVar()` in `src/ui/cssVar.ts` only.
- No inline `<script>`. The CSP in `public/_headers` forbids it.
- Import three from `three/webgpu` and `three/tsl` only (never `three`), so WebGPU and the WebGL2 fallback share one path. Test both: `?gl=webgl2` forces the fallback.
- No allocation inside the frame loop. Pool and reuse.
- Factories at the edges (render, UI, audio); ECS only inside the sim (from Phase 1).
- New optional systems go behind `src/features.ts`; disabled factories return `null`.
- Quality decisions live in `src/platform/devicePolicy.ts` (pure, unit-tested).
- Pin exact dependency versions. Verify with `npm view <pkg> version` before upgrading.
- Original identity only: no franchise names, silhouettes, sounds or assets. Record asset licences in `CREDITS.md`.

## Budgets (CI-enforced where possible)

60 fps on an integrated GPU at Medium · < 150 draw calls · `/play` JS ≤ 400 KB gz (`npm run size`) · first playable ≤ 8 MB.

## Commands

`npm run dev` · `npm run ci` (lint, typecheck, test, build, size) · `npm run deploy` (Cloudflare Pages).

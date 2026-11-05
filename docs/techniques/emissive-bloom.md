# Emissive-only bloom

**Where:** `src/render/post/pipeline.ts`

**Why:** in space, a full-scene bloom washes the void grey. Blooming only emissive surfaces keeps black truly black and makes light carry meaning (engines, threats, the signal).

**How:** the scene pass writes two targets via MRT: `output` (beauty) and `emissive`. `bloom()` runs on the emissive texture only and is added to the beauty pass.

**Knobs:** strength (1.1), radius (0.5), threshold (0: the emissive target is already selective). Disabled on the `low` preset via `devicePolicy`.

**Rule for artists:** if something should glow, give it `emissive` + `emissiveIntensity` > 1. Nothing else glows.

**Next:** run bloom at half resolution once the Phase 3 performance pass starts.

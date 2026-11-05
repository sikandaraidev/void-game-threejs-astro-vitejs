# VOID: Asset Production Brief

**For:** ChatGPT (image generation) and Codex (code agent).
**Produces:** every visual and media asset for VOID, a cinematic first-person space-combat browser game built with three.js.
**How to use this file:** paste **§0 and §1 first** into any new chat as context, then paste one asset section (§4 to §9) at a time. Every prompt block is self-contained and safe to copy as-is.

---

## 0. Rules for the AI (paste first, every session)

```text
You are producing assets for VOID, an ORIGINAL cinematic space-combat game.
Hard rules:
1. 100% original designs. Never imitate any existing franchise. Specifically do NOT resemble:
   X-wing, TIE fighter, Star Destroyer, Millennium Falcon, any Star Wars ship or droid;
   Halo, Mass Effect (Normandy), Homeworld, EVE Online, Battlestar Galactica (Vipers),
   The Expanse (Rocinante), Star Citizen, No Man's Sky, Elite Dangerous ships.
   No wedge-triangle capital ships. No X-shaped wing layouts. No hexagonal wing panels.
2. Style: grounded, cinematic, industrial sci-fi. Worn, used, believable engineering.
   Never cartoonish, toy-like, chibi, low-poly cute, glossy plastic or "mobile game" style.
3. Lighting language: the void is near-black. Light means information.
   Only engines, weapons, weak points and the Signal glow.
4. Palette (exact hex):
   void #05060A · player cyan #6FE3FF · Signal amber #FFB347 (danger + mystery ONLY)
   Hollow light (enemy glow) #C9B8FF · player hull bone-white #D8D2C4 · charcoal #23262D
   enemy hull burnt black #15131A · rust #7A3E2A
5. Output must be usable in production: clean silhouettes, readable at small size,
   consistent scale, and technical specs from §3 followed exactly.
```

---

## 1. Creative bible (paste second)

### 1.1 The world in five lines

- Something beyond the edge of the observable universe is broadcasting: **the Signal**.
- Every expedition sent toward it vanished. They didn't die. **The Signal remade them.**
- Their ships came back as **the Hollow Fleet**: dead vessels rebuilt from salvage, stitched together with seams of pale violet "hollow light", moving like predators, still wearing their old paint underneath the scorch.
- The player crews the **VESPER**, a deep-survey cutter built around **the Lodestone**, a shard of the Signal recovered from a wreck. The Lodestone glows amber in the ship's open spine. The Hollow Fleet hunts it.
- Each run is a **Jump**: three zones of space, then a destination guardian, then the jump further out. As the Voyage gets closer to the edge, space loses its colour.

### 1.2 Feeling

**Cosmic Sublime:** awe first, dread underneath. Scale contrast: a small ship against colossal things. Space-opera spectacle (dogfights, close passes, giant ships) in a fully original visual language.

### 1.3 Design language

|                 | **VESPER (player)**                                                                 | **Hollow Fleet (enemy)**                                                                             |
| --------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Shape language  | Long, precise, engineered; **split twin hull** with an open spine                   | Asymmetric, **grown from wreckage**; skeletal, ribbed, mismatched parts                              |
| Surface         | Bone-white ceramic panels, charcoal frames, worn edges, survey markings and numbers | Burnt black plating, rust, scorched old paint, **violet-white seams of light** where parts are fused |
| Glow            | Cyan engines, **amber Lodestone core** in the spine                                 | Pale violet hollow light in seams, "eyes" and engines                                                |
| Motion read     | Stable, heavy, deliberate                                                           | Twitchy, predatory, folding and unfolding                                                            |
| Silhouette test | Recognisable as a black shape at 64 px                                              | Each class recognisable as a black shape at 48 px                                                    |

---

## 2. Delivery workflow (how ChatGPT and Codex work together)

1. **Concept** (ChatGPT image tool): a 3/4 hero render plus a **turnaround sheet** (front, side, top, back) on a flat neutral grey background. Pick the best one; iterate on it only.
2. **Model** (pick one route per asset):
   - **Route A, Codex + Blender (recommended for ships):** give Codex the chosen concept images and the asset section. Codex writes a **Blender 4.x Python script** (`tools/blender/build_<asset>.py`) that builds the model procedurally (hull blocks, bevels, booleans, arrays, greebles), assigns the named materials from §3.4, adds the named empties from §3.5, and exports `.glb`. Run it with: `blender -b -P tools/blender/build_<asset>.py`. Scripts are versioned in the repo, so models can be regenerated and tweaked by editing parameters.
   - **Route B, image-to-3D:** feed the turnaround into an image-to-3D tool, then use Blender (or a Codex cleanup script) to fix scale, orientation, materials and empties per §3. Fast, but needs cleanup.
   - **Route C, artist:** hand the section to a 3D artist as the brief.
3. **Textures** (ChatGPT image tool): seamless tiling PBR base textures and decal sheets (§8), then baked or applied in Blender.
4. **Validate** with the checklist in §11 before committing.
5. **Commit** to `public/models/` (or `public/textures/`, `public/audio/`) with the exact filenames in §10. The game's model loader replaces the procedural placeholder automatically when the file exists.

---

## 3. Global technical specs (every 3D asset)

### 3.1 Format and units

- **glTF 2.0 binary (`.glb`)**, one asset per file.
- **1 unit = 1 metre.** **Y is up.** **The nose points toward −Z** (the game's direction of travel).
- Origin at the centre of mass (ships) or the camera eye (interiors).
- Apply all transforms before export (scale 1, rotation 0).
- No cameras or lights in the file. No animations unless the section asks for them.

### 3.2 Polygon budgets (triangles)

| Asset                    | LOD0           | LOD1 (optional) |
| ------------------------ | -------------- | --------------- |
| VESPER exterior          | 30,000–45,000  | 10,000          |
| Cockpit interior         | 25,000–40,000  | —               |
| Turret interior          | 12,000–20,000  | —               |
| Needle (interceptor)     | 3,000–5,000    | 1,200           |
| Moth (heavy fighter)     | 5,000–8,000    | 2,000           |
| Lamplighter (bomber)     | 6,000–9,000    | 2,500           |
| The Ossuary (mothership) | 60,000–100,000 | 25,000          |
| Power-up pods            | 600–1,500 each | —               |

Enemy fighters appear 10–20 at once, so their budgets are strict.

### 3.3 Textures

- PBR metallic-roughness. One texture set per asset.
- Maps: `baseColor` (sRGB), `normal` (OpenGL, Y+), `ORM` (R = occlusion, G = roughness, B = metallic), `emissive` (sRGB, black everywhere that doesn't glow).
- Sizes: hero assets (VESPER, cockpit, Ossuary) 2048²; fighters 1024²; pods 512². Power-of-two only.
- PNG for delivery. The build converts them to KTX2.

### 3.4 Material names (exact; the game reads these)

| Material name     | Use                                             | Glows?                   |
| ----------------- | ----------------------------------------------- | ------------------------ |
| `hull`            | Main body                                       | No                       |
| `trim`            | Frames, mechanical parts, greebles              | No                       |
| `glass`           | Canopies, sensor lenses                         | No (slight reflection)   |
| `emissive_engine` | Player engines (cyan)                           | **Yes**                  |
| `emissive_signal` | The Lodestone, weak points, danger (amber)      | **Yes**                  |
| `emissive_hollow` | Enemy seams, eyes, engines (violet-white)       | **Yes**                  |
| `screen`          | Cockpit instrument screens (game draws on them) | Yes (driven by the game) |

Only `emissive_*` and `screen` may have emissive colour. The game blooms only emissive surfaces.

### 3.5 Named empties (exact names; the game attaches gameplay to these)

| Empty name                        | Where                                            | Used for                     |
| --------------------------------- | ------------------------------------------------ | ---------------------------- |
| `muzzle_L`, `muzzle_R`            | Gun tips (forward cannons or turret barrels)     | Bullet origin + muzzle flash |
| `engine_1` … `engine_N`           | Engine nozzle centres, pointing +Z (backward)    | Exhaust flame + light        |
| `turret_dorsal`, `turret_ventral` | Turret rotation pivots (VESPER)                  | Turret aim                   |
| `cockpit_eye`                     | Pilot eye position (VESPER and cockpit interior) | First-person camera          |
| `weakpoint_1` … `weakpoint_4`     | Ossuary hearts                                   | Boss targets                 |
| `hardpoint_*`                     | Enemy gun positions                              | Enemy fire origin            |

### 3.6 Naming and export

- Mesh objects in lowercase snake_case (`hull_main`, `wing_l`).
- Export with: +Y up, apply modifiers, include custom properties off, compression off (the build compresses).

---

## 4. Player ship: the VESPER

### 4.1 Design brief

- **Role:** deep-survey cutter, armed after the expeditions vanished. Crew of 1–3: pilot, dorsal gunner, ventral gunner.
- **Length 28 m**, span 14 m, height 7 m.
- **Silhouette (the identity):** two long **blade-like hull halves** running parallel, joined by three structural bridges. Between them is an **open spine** where the **Lodestone** hangs in a cradle of clamps and cables, glowing amber. You can see stars through the gap.
- Cockpit: in the forward end of the **port (left) hull**. The canopy is a narrow wraparound band of glass, not a bubble.
- Turrets: a **dorsal turret** on top of the middle bridge and a **ventral turret** under it. Each is a squat armoured sphere with twin long barrels.
- Engines: four rectangular nozzles, two at the rear of each hull, cyan.
- Surface: bone-white ceramic tiles, charcoal structural frames, scuffed edges, a faded orange survey stripe, hull number **VSP-07** stencilled near the nose, small warning decals.
- **Intrigue:** the Lodestone's amber light spills onto the inner faces of both hulls. Some panels near it are scorched in strange regular patterns, as if something has been writing on them.

### 4.2 ChatGPT image prompt: hero concept

```text
Concept art, 3/4 front view, of an original sci-fi spacecraft called VESPER.
A deep-survey cutter, 28 metres long, made of TWO long parallel blade-like hull halves
joined by three structural bridges, with an OPEN SPINE between them. Suspended in the spine
is a glowing amber crystal shard (#FFB347) held by mechanical clamps and cables; its light
spills onto the inner hull walls. Narrow wraparound canopy band at the front of the left hull.
Squat armoured gun turret with twin long barrels on top of the middle bridge.
Four rectangular cyan (#6FE3FF) engine nozzles at the rear.
Bone-white worn ceramic hull panels (#D8D2C4), charcoal frames (#23262D), faded orange survey
stripe, stencilled hull number "VSP-07", small warning decals, scuffed edges.
Grounded industrial engineering, believable, heavy. Deep space background, near-black,
one distant blue nebula, strong rim light from a white sun.
Cinematic, photoreal concept art, high detail. NOT cartoon, NOT toy-like, NOT glossy plastic.
Must not resemble any Star Wars, Halo, Mass Effect or The Expanse ship. No X-wings, no wedge shapes.
```

### 4.3 ChatGPT image prompt: turnaround sheet

```text
Orthographic turnaround model sheet of the VESPER spacecraft from the reference image:
front view, side view (left), top view, back view, arranged in a grid,
flat neutral mid-grey background (#808080), even studio lighting, no perspective, no background
stars, no text except small view labels. Same design, same proportions in every view
(28 m long, 14 m wide, 7 m tall). Clean lines suitable as 3D modelling reference.
```

### 4.4 Codex task: build the model (Route A)

```text
Task: write tools/blender/build_vesper.py, a Blender 4.x Python script that builds the VESPER
exterior procedurally and exports public/models/vesper.glb.
Follow this brief exactly: [paste §3 and §4.1]. Use the attached turnaround images as reference.
Requirements:
- Units metres, +Y up, nose toward -Z, origin at centre of mass, transforms applied.
- Build from bevelled boxes, booleans, arrays and curves; add greebles (vents, panel insets,
  antenna, clamps) as instanced/linked duplicates to stay inside 30k-45k triangles.
- Materials named exactly: hull, trim, glass, emissive_engine, emissive_signal.
  Principled BSDF only. Emissive only on emissive_* materials.
- Empties named exactly: muzzle_L, muzzle_R (forward chin guns), engine_1..engine_4,
  turret_dorsal, turret_ventral, cockpit_eye.
- Expose top-of-file parameters (lengths, spine gap, bridge count, greeble density, seed).
- Export glb with +Y up and apply modifiers. Print the final triangle count.
- Also export public/models/vesper_lod1.glb at ~10k triangles (decimate).
```

---

## 5. Interiors (first-person views)

### 5.1 Cockpit (pilot seat)

- What the player sees: a **narrow, low cockpit**. The canopy band wraps from left to right with **thick charcoal struts**. Below it is an angled **dashboard** with three screens (`screen` material: left = ship status, centre = targeting, right = crew/comms) and physical toggle rows. There are throttle and stick shapes at the lower edges, and worn grip tape.
- The **amber glow of the Lodestone** leaks in from the right side (the spine is next to the cockpit), the one warm light in a cold cockpit.
- The camera sits at `cockpit_eye`. The view must keep **at least 60% of the screen as clear space** through the canopy (gameplay first).
- File: `public/models/cockpit.glb`, budget 25k–40k triangles.

```text
First-person view from inside the cockpit of an original sci-fi survey ship, looking forward
into deep space. Narrow wraparound canopy glass band held by thick charcoal struts. Angled
dashboard with three glowing instrument screens (cyan UI, minimal), rows of chunky physical
toggle switches, worn grip tape, scratches on the glass catching starlight. A warm amber glow
leaks in from the right side. Outside: a dogfight in a purple-blue nebula with tiny enemy
ships trailing violet light. At least 60% of the view is open space through the canopy.
Cinematic, photoreal, grounded industrial design, analog-retro-future details (CRT glow,
scanlines on screens). NOT cartoon. Must not resemble any Star Wars cockpit.
```

### 5.2 Turret (gunner seats)

- The gunner sits **inside an armoured sphere** looking out through a **circular glass port** divided by a thin crosshair frame. Two long barrels run along the left and right edges of the view (with `muzzle_L` and `muzzle_R` at their tips) and **recoil** when firing. There are hand grips at the bottom, small heat gauges and an amber "overheat" lamp.
- The same model serves both turrets (the ventral one is mirrored by the game).
- File: `public/models/turret_interior.glb`, budget 12k–20k triangles. Barrels are separate objects named `barrel_L` and `barrel_R` (the game animates recoil along +Z).

```text
First-person view from inside a spherical armoured gun turret on a spaceship, looking out
through a large circular glass port with a thin crosshair frame. Two long heavy gun barrels
run along the left and right edges of the view toward space. Hand grips at the bottom,
small analog heat gauges, an amber warning lamp. Outside: enemy fighters with violet-white
light seams diving toward the viewer, amber laser bolts, a giant gas planet. Cinematic,
photoreal, worn industrial, dark interior lit by instrument glow. Original design,
must not resemble the Millennium Falcon turret or any existing franchise.
```

---

## 6. Enemy: the Hollow Fleet

**Concept:** ships from lost expeditions, **remade by the Signal**. Each is built from salvage: an old hull core, extra fused plates, exposed ribs, and **seams of pale violet-white light** (#C9B8FF) where parts were joined. You can still see traces of their old human paint and numbers under the scorch. They move like animals: twitch, fold, dive.

Readability rules: each class has a **unique silhouette** and a **unique motion**. Enemy weapons fire **amber** bolts (danger colour). Their glow is violet-white; their weak spots are never amber except on the Ossuary.

### 6.1 Needle (interceptor, swarm)

- **Length 9 m.** A single long skeletal spine with a cluster of **three backward-raked fins** at the rear like a thrown dart. One glowing violet "eye" sensor at the nose. Exposed ribs along the spine.
- Motion: fast, in swarms of 4–6, head-on passes past the canopy.
- One gun hardpoint under the nose (`hardpoint_1`). Engine: one, `engine_1`.

```text
Concept art turnaround of an original enemy spacecraft "Needle": a 9-metre skeletal
interceptor built from salvaged wreckage. A long exposed-rib spine like a dart, three
backward-raked fins clustered at the rear, one glowing pale violet (#C9B8FF) sensor eye at
the nose, seams of violet-white light where scavenged parts are fused together. Burnt black
plating (#15131A), rust, traces of old scorched human paint and a faded serial number.
Predatory, unsettling, beautiful. 3/4 hero view plus front/side/top orthographic views on
flat grey background. Photoreal concept art. NOT cartoon. Must not resemble TIE fighters,
X-wings or any existing franchise ship.
```

### 6.2 Moth (heavy fighter)

- **Length 12 m, wingspan 16 m.** A heavy armoured body with **two pairs of wings that fold flat against the body in flight** and **open wide like a moth before firing**, revealing glowing violet membrane-like panels on their inner faces. The open-wing pose is the **tell** that it is about to fire (telegraphing).
- Motion: slower, loops behind the player and attacks from the rear and below (the gunners' main targets).
- Wing objects must be separate and named `wing_upper_l`, `wing_upper_r`, `wing_lower_l`, `wing_lower_r`, with pivots at the hinge (the game animates them open/closed). Hardpoints `hardpoint_1`, `hardpoint_2`.

```text
Concept art turnaround of an original enemy heavy fighter "Moth", 12 m long. Armoured
salvaged body, two pairs of large wings shown in two states: folded flat against the body,
and fully opened like a moth revealing glowing pale violet (#C9B8FF) translucent panels on the
inner faces. Burnt black plating, rust, violet-white light seams, faded old paint markings.
Menacing and elegant. Orthographic front/side/top views in both wing states, plus a 3/4 hero
view, flat grey background. Photoreal. Original design, no existing franchise resemblance.
```

### 6.3 Lamplighter (bomber)

- **Length 15 m.** A bulky barrel-shaped hull held inside a **cage of curved ribs**. Inside the cage, a captured **lantern of hollow light** pulses. It launches slow homing **lantern torpedoes** that the gunners can shoot down.
- Motion: slow, arrives in pairs, keeps distance.
- Torpedo is a separate file: `public/models/lantern_torpedo.glb` (≤ 800 triangles, glowing core).

```text
Concept art turnaround of an original enemy bomber "Lamplighter", 15 m long: a bulky
barrel-shaped salvaged hull enclosed in a cage of curved black ribs, with a large pulsing
pale violet-white light (#C9B8FF) trapped inside the cage like a lantern. Rust, scorch,
faded old paint. Slow, heavy, eerie. 3/4 view plus orthographic views on flat grey background.
Photoreal concept art. Original, no existing franchise resemblance.
```

### 6.4 The Ossuary (mothership, destination guardian)

- **Length 900 m**, vertical-leaning silhouette. It is **not a wedge** and not a disc. It is a **colossal spine of fused wrecks**: hundreds of dead ships compressed into a vertical ribcage that reads like a **cathedral built from bones**, slowly rotating rings of debris around it.
- **Four amber "hearts"** (`weakpoint_1..4`, the only amber on any enemy): reactor cores of the original captured flagships, set into openings in the ribcage and protected by moving plates. Destroying them is the boss fight.
- Hollow-light seams everywhere; launch bays spit Needles. Gun hardpoints `hardpoint_1..12`.
- In-game it is seen from 300 m to 1.5 km away. Detail goes into the **silhouette and lights**, not small greebles.

```text
Epic concept art of an original colossal alien-reclaimed mothership "The Ossuary", 900 metres
tall, seen from below at a distance in deep space. A vertical ribcage-like spine built from
hundreds of fused dead spaceship wrecks, reading as a cathedral made of bones; slowly rotating
rings of debris orbit it. Seams of pale violet-white light (#C9B8FF) run through it. Four huge
glowing AMBER (#FFB347) reactor hearts set into openings in the ribcage, partly shielded by
armour plates. Swarms of tiny fighters pour from launch bays. Scale contrast with a tiny
spacecraft in the foreground. Awe and dread. Cinematic, photoreal, volumetric light.
NOT a wedge-shaped Star Destroyer, NOT a disc or saucer, original design.
```

### 6.5 Codex task: enemy models

```text
Task: write tools/blender/build_hollow_fleet.py that builds Needle, Moth (with separate hinged
wing objects) and Lamplighter procedurally and exports public/models/needle.glb, moth.glb,
lamplighter.glb, lantern_torpedo.glb. Follow §3 and §6 exactly: metres, +Y up, nose -Z,
materials hull/trim/emissive_hollow (+ emissive_signal nowhere), named empties and wing objects,
budgets per §3.2. Make the fused-salvage look by combining mismatched primitives with slight
random rotations (seeded), add emissive seam strips along joins. Print triangle counts.
Separate task: tools/blender/build_ossuary.py for the mothership (§6.4), 60k-100k triangles,
weakpoint_1..4 empties at the hearts, debris rings as a separate object named debris_ring.
```

---

## 7. Power-up salvage pods

Pods drift out of destroyed enemies. Shooting or flying through one collects it. Each pod has a **unique shape and colour** (never colour alone: accessibility). Size 1.5 m, budget 600–1,500 triangles, materials `trim` plus one emissive.

| Pod                 | Effect                             | Shape                       | Glow               |
| ------------------- | ---------------------------------- | --------------------------- | ------------------ |
| **Shield Cell**     | Instantly refills shields          | Hexagonal capsule           | Cyan               |
| **Patch Kit**       | Repairs 25 hull                    | Rounded cross-shaped crate  | Soft green #7CFFB2 |
| **Overcharge**      | Double fire rate for 8 s           | Spiked sphere               | Hot white #FFF1D6  |
| **Coolant**         | Turrets never overheat for 10 s    | Ribbed cylinder             | Ice blue #9FF4FF   |
| **Swarm Missiles**  | Next 6 shots fire homing missiles  | Long canister with fins     | Orange-red #FF6B3D |
| **Lodestone Pulse** | Slows time around the ship for 4 s | Small amber shard in a cage | Amber (the Signal) |

```text
Game asset sheet: six original sci-fi salvage power-up pods floating in space, each 1.5 m,
worn metal with one strong glow colour and a unique silhouette: (1) hexagonal capsule, cyan;
(2) rounded cross-shaped crate, soft green; (3) spiked sphere, hot white; (4) ribbed cylinder,
ice blue; (5) finned missile canister, orange-red; (6) small amber crystal shard held in a
metal cage. Arranged in a row, flat dark background, product-style lighting, readable
silhouettes, photoreal, industrial. Not cartoon.
```

Also needed: a **flat HUD icon** for each (§9).

---

## 8. Textures and decals (ChatGPT image tool)

All seamless, square, 2048×2048 unless stated, flat even lighting, **no perspective, no shadows baked in**.

1. **VESPER ceramic panels:** `"Seamless tileable texture, worn bone-white ceramic spaceship hull tiles, thin dark panel gaps, subtle scuffs and dirt in the gaps, top-down flat lighting, no perspective, PBR base colour"`.
2. **Charcoal trim metal:** brushed dark gunmetal, fine scratches.
3. **Hollow Fleet burnt plating:** burnt black metal with rust blooms and patches of scorched old paint.
4. **Hollow seam strip:** 1024×256 horizontal strip of glowing violet-white fused seam (emissive).
5. **Decal sheet (transparent PNG, 2048²):** stencilled numbers `VSP-07`, survey stripes, warning chevrons, hazard labels in an invented technical script, rivet rows. Original glyphs only, no real-world logos.
6. **Space backgrounds (equirectangular 4096×2048, for the sky):** one per region:
   - Known space: saturated violet-teal nebula with a galactic band.
   - The fringe: desaturated rose-grey dust.
   - The edge: near-black with sparse cold stars and a faint amber smear (the Signal).

   Prompt suffix: `"equirectangular 360 panorama, seamless left-right edges, no planets, no foreground objects"`.

---

## 9. 2D and media

| Asset               | Size                                  | Notes                                                                   |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| Key art             | 3840×2160                             | VESPER in the foreground, the Ossuary looming, a dogfight between them  |
| Social / OG image   | 1200×630                              | Key art crop + "VOID" wordmark space at left                            |
| Store capsule       | 920×430 and 460×215                   | itch.io / later Steam                                                   |
| Logo wordmark       | SVG + 2048 PNG                        | "VOID", wide-tracked monospace-technical, with a thin amber mark        |
| Favicon             | 512 PNG                               | Simplified VESPER silhouette with amber spine dot                       |
| HUD icons           | 128×128, transparent PNG, white glyph | 6 power-ups, 3 seats (pilot / dorsal / ventral), 3 difficulty levels    |
| Codex illustrations | 1600×1000                             | One per enemy class and per zone, in a "declassified survey file" style |
| Zone title cards    | 1920×1080                             | The Lantern Reach, Ashfall Drift, The Quiet Shelf                       |

HUD icon prompt pattern:

```text
Minimal flat game HUD icon, white glyph on transparent background, 128x128, thick clear
strokes readable at 24 px, geometric technical style, no text: [describe symbol].
```

---

## 10. File naming and locations (the game expects these exact paths)

```text
public/models/vesper.glb            public/models/vesper_lod1.glb
public/models/cockpit.glb           public/models/turret_interior.glb
public/models/needle.glb            public/models/moth.glb
public/models/lamplighter.glb       public/models/lantern_torpedo.glb
public/models/ossuary.glb
public/models/pod_shield.glb  pod_patch.glb  pod_overcharge.glb
public/models/pod_coolant.glb  pod_missiles.glb  pod_pulse.glb
public/textures/sky_known.jpg  sky_fringe.jpg  sky_edge.jpg
public/textures/decals.png
public/ui/icons/*.png
public/media/keyart.jpg  og.jpg  logo.svg  favicon.png
tools/blender/build_*.py            (Codex model scripts, versioned)
```

Every third-party input (image-to-3D service, texture source) is recorded in `CREDITS.md` with its licence.

---

## 11. Acceptance checklist (run before committing any asset)

- [ ] Original: no resemblance to any franchise in §0 (compare side by side).
- [ ] Silhouette readable as a black shape (VESPER 64 px, fighters 48 px).
- [ ] glb opens at https://gltf-viewer.donmccurdy.com with no errors.
- [ ] Metres, +Y up, nose −Z, origin correct, transforms applied.
- [ ] Triangle count within §3.2.
- [ ] Material names exactly as in §3.4; emissive only on `emissive_*` and `screen`.
- [ ] Empties named exactly as in §3.5, at the right positions.
- [ ] Textures power-of-two, correct colour spaces, file sizes reasonable (hero ≤ 6 MB, fighter ≤ 1.5 MB).
- [ ] Palette matches §0 hex values.
- [ ] Credits and licences recorded.

---

## 12. Audio (for reference; use dedicated audio tools)

ChatGPT's image tool does not make audio. Codex can write procedural Web Audio code, which the game already uses for prototype sounds. For final audio, use a music or SFX generator or a composer, using this list:

| Sound              | Character                                                                        |
| ------------------ | -------------------------------------------------------------------------------- |
| VESPER engine loop | Deep, steady hum with a faint choir-like overtone from the Lodestone             |
| Forward cannons    | Short, punchy, metallic "thak" with a cyan sizzle tail                           |
| Turret twin guns   | Fast alternating heavy thumps, mechanical recoil clank                           |
| Needle pass-by     | Rising-then-falling whine with a doppler shift                                   |
| Moth wings opening | Wet mechanical unfolding plus rising violet hum (the warning tell)               |
| Hollow Fleet bolt  | Hollow, resonant "whoom", slightly reversed                                      |
| Explosions         | Low boom, metal debris, a breath of silence after big ones                       |
| The Ossuary        | A sub-bass choir that swells as you approach                                     |
| Jump               | Inhale of silence, then a rising roar, then a clean bell tone                    |
| Music              | Known space: heroic orchestral + synth pads. Fringe: choral. Edge: sparse drones |

Formats: OGG (Vorbis) + M4A fallback, 44.1 kHz, loops seamless, SFX ≤ 2 s and normalised to −14 LUFS.

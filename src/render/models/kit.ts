import {
  Color,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Tiny procedural-modelling kit: place primitive parts, then merge them per material so a whole
 * ship costs one draw call per material. Placeholder until authored glTF models replace them
 * (docs/asset-production-brief.md); the material names match the brief.
 */
export type MaterialName =
  'hull' | 'trim' | 'glass' | 'paint' | 'emissive_engine' | 'emissive_signal' | 'emissive_hollow';

export class PartList {
  private readonly parts = new Map<MaterialName, BufferGeometry[]>();

  add(
    material: MaterialName,
    geo: BufferGeometry,
    pos: [number, number, number] = [0, 0, 0],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ): this {
    const m = new Matrix4().compose(
      new Vector3(...pos),
      new Quaternion().setFromEuler(new Euler(...rot)),
      new Vector3(...scale),
    );
    // All parts non-indexed so heterogeneous primitives merge cleanly.
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material)?.push(g);
    if (g !== geo) geo.dispose();
    return this;
  }

  /** Mirror every part added by `fn` across X (left/right symmetry). */
  mirrorX(fn: (side: 1 | -1) => void): this {
    fn(1);
    fn(-1);
    return this;
  }

  build(): Map<MaterialName, BufferGeometry> {
    const out = new Map<MaterialName, BufferGeometry>();
    for (const [name, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (merged) {
        merged.computeBoundingSphere();
        out.set(name, merged);
      }
    }
    return out;
  }
}

export interface Palette {
  hull: string;
  trim: string;
  paint?: string;
  engine?: string;
  hollow?: string;
}

/** Shared materials (PBR; the baked sky provides reflections). */
export function makeMaterials(p: Palette): Record<MaterialName, MeshStandardMaterial> {
  const black = new Color('#000000');
  return {
    hull: new MeshStandardMaterial({ color: new Color(p.hull), roughness: 0.48, metalness: 0.3 }),
    trim: new MeshStandardMaterial({ color: new Color(p.trim), roughness: 0.55, metalness: 0.75 }),
    glass: new MeshStandardMaterial({ color: new Color('#0a1620'), roughness: 0.06, metalness: 0.9 }),
    paint: new MeshStandardMaterial({
      color: new Color(p.paint ?? '#c8642c'),
      roughness: 0.6,
      metalness: 0.1,
    }),
    emissive_engine: new MeshStandardMaterial({
      color: black,
      emissive: new Color(p.engine ?? '#6fe3ff'),
      emissiveIntensity: 3,
    }),
    emissive_signal: new MeshStandardMaterial({
      color: black,
      emissive: new Color('#ffb347'),
      emissiveIntensity: 3.5,
    }),
    emissive_hollow: new MeshStandardMaterial({
      color: black,
      emissive: new Color(p.hollow ?? '#c9b8ff'),
      emissiveIntensity: 2.4,
    }),
  };
}

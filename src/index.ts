import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  SCAXEngine,
  type AstigmatismSummaryItem,
  type SCAXEngineProps,
  type SimulateResult,
} from 'scax-engine';

const TAG = '[scax-wc]';

type LensRenderConfig = NonNullable<SCAXEngineProps['lens']>[number] & {
  diameter?: number;
  type?: 'lens' | 'cross-cylinder';
};

type ScaxRenderConfig = Omit<SCAXEngineProps, 'lens'> & {
  lens?: LensRenderConfig[];
  render?: {
    pupil?: boolean;
  };
};

type CameraProjection = 'perspective' | 'orthogonal';

type CameraPosition = {
  x?: number;
  y?: number;
  z?: number;
};

type CameraLookAt = {
  x?: number;
  y?: number;
  z?: number;
};

type CameraRenderOptions = {
  projection?: CameraProjection;
  position?: CameraPosition;
  lookAt?: CameraLookAt;
  enableZoom?: boolean;
  enablePan?: boolean;
  enableRotate?: boolean;
  autoFit?: boolean;
};

type CameraPose = {
  position: THREE.Vector3;
  target: THREE.Vector3;
};

export type CameraStateSnapshot = {
  projection: CameraProjection;
  position: Required<CameraPosition>;
  target: Required<CameraLookAt>;
  zoom: number;
};

export type CameraStateInput = {
  projection?: CameraProjection;
  position?: CameraPosition;
  target?: CameraLookAt;
  zoom?: number;
};

function isCameraProjection(value: unknown): value is CameraProjection {
  return value === 'perspective' || value === 'orthogonal';
}

/** SCAXEngine.configure()와 동일한 기본값 */
export function defaultScaxConfig(): ScaxRenderConfig {
  return {
    eyeModel: 'gullstrand',
    eye: { s: 0, c: 0, ax: 0 },
    lens: [],
    light_source: {
      type: 'grid',
      width: 10,
      height: 10,
      division: 4,
      z: -10,
      vergence: 0,
    },
    pupil_type: 'neutral',
    render: {
      pupil: false,
    },
  };
}
/** 얕은 병합: 최상위만 덮어쓰고, eye는 필드 단위 병합 */
export function mergeScaxConfig(
  partial: Partial<ScaxRenderConfig> | null | undefined,
): ScaxRenderConfig {
  const base = defaultScaxConfig();
  if (!partial) return base;
  return {
    ...base,
    ...partial,
    eye: { ...base.eye!, ...partial.eye },
    lens: partial.lens ?? base.lens,
    light_source: partial.light_source ?? base.light_source,
    pupil_type: partial.pupil_type ?? base.pupil_type,
    eyeModel: partial.eyeModel ?? base.eyeModel,
    render: {
      ...base.render,
      ...partial.render,
    },
  };
}
export function parseConfigAttribute(raw: string | null): ScaxRenderConfig {
  if (raw == null || raw.trim() === '') {
    return defaultScaxConfig();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`${TAG} "config" must be a JSON object. Got:`, raw);
      return defaultScaxConfig();
    }
    return mergeScaxConfig(parsed as Partial<ScaxRenderConfig>);
  } catch {
    console.warn(`${TAG} Failed to parse JSON "config", using defaults. Raw:`, raw);
    return defaultScaxConfig();
  }
}

export function defaultCameraOptions(): CameraRenderOptions {
  return {
    projection: 'perspective',
    position: { x: 120, y: 120, z: -80 },
    lookAt: { x: 0, y: 0, z: 0 },
    enableZoom: true,
    enablePan: true,
    enableRotate: true,
    autoFit: false,
  };
}

export function mergeCameraOptions(
  partial: Partial<CameraRenderOptions> | null | undefined,
): CameraRenderOptions {
  const base = defaultCameraOptions();
  if (!partial) return base;
  const position = partial.position;
  const lookAt = partial.lookAt;
  const x = Number(position?.x);
  const y = Number(position?.y);
  const z = Number(position?.z);
  const lookAtX = Number(lookAt?.x);
  const lookAtY = Number(lookAt?.y);
  const lookAtZ = Number(lookAt?.z);
  return {
    projection: isCameraProjection(partial.projection) ? partial.projection : base.projection,
    position: {
      x: Number.isFinite(x) ? x : base.position?.x,
      y: Number.isFinite(y) ? y : base.position?.y,
      z: Number.isFinite(z) ? z : base.position?.z,
    },
    lookAt: {
      x: Number.isFinite(lookAtX) ? lookAtX : base.lookAt?.x,
      y: Number.isFinite(lookAtY) ? lookAtY : base.lookAt?.y,
      z: Number.isFinite(lookAtZ) ? lookAtZ : base.lookAt?.z,
    },
    enableZoom: partial.enableZoom ?? base.enableZoom,
    enablePan: partial.enablePan ?? base.enablePan,
    enableRotate: partial.enableRotate ?? base.enableRotate,
    autoFit: partial.autoFit ?? base.autoFit,
  };
}

type SurfaceLike = {
  type?: string;
  name?: string;
  position?: { x?: number; y?: number; z?: number };
  tilt?: { x?: number; y?: number };
  s?: number;
  c?: number;
  ax?: number;
  n_before?: number;
  n_after?: number;
  r?: number;
  radius?: number;
  conic?: number;
  r_axis?: number;
  r_perp?: number;
  front?: SurfaceLike;
  back?: SurfaceLike;
  incident?: (ray: RayLike) => THREE.Vector3 | null;
  refract?: (ray: RayLike) => RayLike | null;
};

type LightSourceLike = {
  emitRays?: () => unknown[];
};

type EngineStateLike = {
  lens?: SurfaceLike[];
  surfaces?: SurfaceLike[];
  light_source?: LightSourceLike;
};

type RayLike = {
  points?: THREE.Vector3[];
  _points?: THREE.Vector3[];
  displayColor?: number;
  clone?: () => RayLike;
  getDirection?: () => THREE.Vector3;
  endPoint?: () => THREE.Vector3;
};

type AffineResultLike = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  count: number;
  residualAvgPct?: number;
  residualMaxPct?: number;
  residuals?: Array<{ magnitude?: number }>;
};

type ScaxColorValue = THREE.ColorRepresentation;
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};

export interface ScaxColorTheme {
  surface: {
    apertureStop: ScaxColorValue;
    cornea: ScaxColorValue;
    compound: ScaxColorValue;
    toric: ScaxColorValue;
    sphericalImage: ScaxColorValue;
    aspherical: ScaxColorValue;
  };
  meridian: {
    combined: {
      strong: ScaxColorValue;
      weak: ScaxColorValue;
    };
    eye: {
      strong: ScaxColorValue;
      weak: ScaxColorValue;
    };
    lens: {
      strong: ScaxColorValue;
      weak: ScaxColorValue;
    };
  };
  cross_cylinder: {
    plus: ScaxColorValue;
    minus: ScaxColorValue;
    plusMarker: ScaxColorValue;
    minusMarker: ScaxColorValue;
    bisector: ScaxColorValue;
  };
  scene: {
    background: ScaxColorValue;
  };
}

export type ScaxColorThemeInput = DeepPartial<ScaxColorTheme>;

export function defaultScaxColorTheme(): ScaxColorTheme {
  return {
    surface: {
      apertureStop: '#000000',
      cornea: '#f8fafc',
      compound: '#60a5fa',
      toric: '#c084fc',
      sphericalImage: '#fb923c',
      aspherical: '#22d3ee',
    },
    meridian: {
      combined: {
        strong: 0xf59e0b,
        weak: 0x06b6d4,
      },
      eye: {
        strong: 0x38bdf8,
        weak: 0xf472b6,
      },
      lens: {
        strong: 0x3b82f6,
        weak: 0xec4899,
      },
    },
    cross_cylinder: {
      plus: 0xef4444,
      minus: 0xffffff,
      plusMarker: 0xef4444,
      minusMarker: 0xffffff,
      bisector: 0x000000,
    },
    scene: {
      background: '#0f172a',
    },
  };
}

export function mergeScaxColorTheme(
  partial: ScaxColorThemeInput | null | undefined,
): ScaxColorTheme {
  const base = defaultScaxColorTheme();
  if (!partial) return base;
  return {
    ...base,
    ...partial,
    surface: { ...base.surface, ...partial.surface },
    meridian: {
      ...base.meridian,
      ...partial.meridian,
      combined: { ...base.meridian.combined, ...partial.meridian?.combined },
      eye: { ...base.meridian.eye, ...partial.meridian?.eye },
      lens: { ...base.meridian.lens, ...partial.meridian?.lens },
    },
    cross_cylinder: { ...base.cross_cylinder, ...partial.cross_cylinder },
    scene: { ...base.scene, ...partial.scene },
  };
}

export function parseColorAttribute(raw: string | null): ScaxColorTheme {
  if (raw == null || raw.trim() === '') {
    return defaultScaxColorTheme();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`${TAG} "color" must be a JSON object. Got:`, raw);
      return defaultScaxColorTheme();
    }
    return mergeScaxColorTheme(parsed as ScaxColorThemeInput);
  } catch {
    console.warn(`${TAG} Failed to parse JSON "color", using defaults. Raw:`, raw);
    return defaultScaxColorTheme();
  }
}

const CORNEA_MERIDIAN_ANTERIOR_OFFSET_MM = -0.25;
const LENS_MERIDIAN_ANTERIOR_OFFSET_MM = -0.2;

type SturmInfoLike = {
  color?: number;
  has_astigmatism?: boolean;
  approx_center?: { x?: number; y?: number; z?: number };
  anterior?: { profile?: { at?: { x?: number; y?: number; z?: number }; angleMajorDeg?: number } };
  posterior?: { profile?: { at?: { x?: number; y?: number; z?: number }; angleMajorDeg?: number } };
};

function readSurfacePosition(surface: SurfaceLike): THREE.Vector3 {
  const x = Number(surface.position?.x ?? 0);
  const y = Number(surface.position?.y ?? 0);
  const z = Number(surface.position?.z ?? 0);
  return new THREE.Vector3(
    Number.isFinite(x) ? x : 0,
    Number.isFinite(y) ? y : 0,
    Number.isFinite(z) ? z : 0,
  );
}

function getRayPoints(ray: unknown): THREE.Vector3[] {
  const casted = ray as RayLike | null;
  if (Array.isArray(casted?.points)) return casted.points;
  if (Array.isArray(casted?._points)) return casted._points;
  return [];
}

function toFinitePoint(pointLike: unknown): THREE.Vector3 | null {
  const point = pointLike as { x?: number; y?: number; z?: number } | null;
  const x = Number(point?.x);
  const y = Number(point?.y);
  const z = Number(point?.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return new THREE.Vector3(x, y, z);
}

function isFiniteVector3(point: THREE.Vector3 | undefined): point is THREE.Vector3 {
  if (!point) return false;
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function normalizeAxis180(angleDeg: number): number {
  const normalized = ((angleDeg % 180) + 180) % 180;
  return normalized;
}

function angleDistance180(aDeg: number, bDeg: number): number {
  const a = normalizeAxis180(aDeg);
  const b = normalizeAxis180(bDeg);
  const diff = Math.abs(a - b);
  return Math.min(diff, 180 - diff);
}

function taboToDeg(taboDeg: number): number {
  const tabo = Number(taboDeg);
  if (!Number.isFinite(tabo)) return 0;
  return (((180 - tabo) % 180) + 180) % 180;
}

function createOrientedLineObject(
  center: THREE.Vector3,
  angleDeg: number,
  lengthMm: number,
  color: THREE.ColorRepresentation,
  opacity = 0.98,
): THREE.Line {
  const angleRad = (angleDeg * Math.PI) / 180;
  const direction = new THREE.Vector3(Math.cos(angleRad), Math.sin(angleRad), 0);
  const p0 = center.clone().addScaledVector(direction, -lengthMm / 2);
  const p1 = center.clone().addScaledVector(direction, lengthMm / 2);
  const geometry = new THREE.BufferGeometry().setFromPoints([p0, p1]);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geometry, material);
}

function surfaceColor(type: string, name: string | undefined, colorTheme: ScaxColorTheme) {
  const lowerType = String(type ?? '').toLowerCase();
  const lowerName = String(name ?? '').toLowerCase();
  if (lowerName === 'pupil_stop' || lowerType === 'aperture_stop') return colorTheme.surface.apertureStop;
  if (lowerName.includes('cornea')) return colorTheme.surface.cornea;
  if (lowerName.includes('retina') || type === 'spherical-image') {
    return colorTheme.surface.sphericalImage;
  }
  if (type === 'compound') return colorTheme.surface.compound;
  if (type === 'toric') return colorTheme.surface.toric;
  if (type === 'aspherical') return colorTheme.surface.aspherical;
  return '#e5e7eb';
}

type MeshBufferData = {
  positions: Float32Array;
  indices: Uint32Array;
};

function mergeMeshBuffers(buffers: MeshBufferData[]): MeshBufferData | null {
  if (!buffers.length) return null;
  const totalPositions = buffers.reduce((sum, buffer) => sum + buffer.positions.length, 0);
  const totalIndices = buffers.reduce((sum, buffer) => sum + buffer.indices.length, 0);
  const positions = new Float32Array(totalPositions);
  const indices = new Uint32Array(totalIndices);

  let positionOffset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;
  for (const buffer of buffers) {
    positions.set(buffer.positions, positionOffset);
    for (let i = 0; i < buffer.indices.length; i += 1) {
      indices[indexOffset + i] = buffer.indices[i] + vertexOffset;
    }
    positionOffset += buffer.positions.length;
    indexOffset += buffer.indices.length;
    vertexOffset += buffer.positions.length / 3;
  }

  return { positions, indices };
}

function reverseWinding(buffer: MeshBufferData): MeshBufferData {
  const reversed = new Uint32Array(buffer.indices.length);
  for (let i = 0; i < buffer.indices.length; i += 3) {
    reversed[i] = buffer.indices[i];
    reversed[i + 1] = buffer.indices[i + 2];
    reversed[i + 2] = buffer.indices[i + 1];
  }
  return { positions: buffer.positions, indices: reversed };
}

function buildDiskMeshData(
  pointAt: (x: number, y: number) => [number, number, number],
  radius: number,
  radialSegments: number,
  angularSegments: number,
): MeshBufferData {
  const positions: number[] = [];
  const indices: number[] = [];
  positions.push(...pointAt(0, 0));

  for (let ring = 1; ring <= radialSegments; ring += 1) {
    const rho = (radius * ring) / radialSegments;
    for (let seg = 0; seg < angularSegments; seg += 1) {
      const theta = (2 * Math.PI * seg) / angularSegments;
      const x = rho * Math.cos(theta);
      const y = rho * Math.sin(theta);
      positions.push(...pointAt(x, y));
    }
  }

  for (let seg = 0; seg < angularSegments; seg += 1) {
    const next = (seg + 1) % angularSegments;
    indices.push(0, 1 + next, 1 + seg);
  }

  for (let ring = 2; ring <= radialSegments; ring += 1) {
    const prevStart = 1 + (ring - 2) * angularSegments;
    const currStart = 1 + (ring - 1) * angularSegments;
    for (let seg = 0; seg < angularSegments; seg += 1) {
      const next = (seg + 1) % angularSegments;
      const a = prevStart + seg;
      const b = prevStart + next;
      const c = currStart + seg;
      const d = currStart + next;
      indices.push(a, b, c, b, d, c);
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

function estimateSurfaceRadius(surface: SurfaceLike): number {
  const type = String(surface.type ?? '').toLowerCase();
  const name = String(surface.name ?? '').toLowerCase();
  const apertureRadius = Number(surface.radius);

  if (type === 'aperture_stop') {
    if (Number.isFinite(apertureRadius) && apertureRadius > 0) return apertureRadius;
    return 2.0;
  }

  if (name.includes('retina') || type === 'spherical-image') return 12.0;
  if (name.includes('cornea')) return 5.8;
  if (name.includes('lens_nucleus')) return 3.3;
  if (name.includes('lens')) return 4.8;
  if (name.includes('eye_st')) return 5.8;
  if (type === 'toric') return 4.8;
  return 5.2;
}

function buildGeometryForSurface(surface: SurfaceLike, radius?: number): MeshBufferData[] {
  const type = String(surface.type ?? '').toLowerCase();
  const pos = readSurfacePosition(surface);
  const radialSegments = 24;
  const angularSegments = 64;
  const safeRadius = Math.max(
    0,
    Number.isFinite(radius ?? Number.NaN) ? (radius as number) : estimateSurfaceRadius(surface),
  );

  if (type === 'compound') {
    const parts = [
      surface.front,
      surface.back,
      (surface as SurfaceLike & { toricSurface?: SurfaceLike }).toricSurface,
      (surface as SurfaceLike & { sphericalSurface?: SurfaceLike }).sphericalSurface,
    ].filter((part): part is SurfaceLike => Boolean(part));
    return parts.flatMap((part) =>
      buildGeometryForSurface(
        part,
        Number.isFinite(radius ?? Number.NaN) ? (radius as number) : estimateSurfaceRadius(part),
      ),
    );
  }

  if (type === 'paraxial') {
    return [
      buildDiskMeshData(
        (x, y) => [pos.x + x, pos.y + y, pos.z],
        safeRadius,
        radialSegments,
        angularSegments,
      ),
    ];
  }

  if (type === 'spherical' || type === 'spherical-image') {
    const isImageSurface = type === 'spherical-image';
    const imageRadius = surface.radius ?? surface.r;
    const r = Number(isImageSurface ? imageRadius : surface.r);
    const planar = !Number.isFinite(r) || Math.abs(r) > 1e12;
    const capRadius =
      isImageSurface && Number.isFinite(r) ? Math.min(safeRadius, Math.abs(r) * 0.8) : safeRadius;

    return [
      buildDiskMeshData(
        (x, y) => {
          const rho2 = x * x + y * y;
          let z = pos.z;
          if (!planar && Math.abs(r) * Math.abs(r) >= rho2) {
            const root = Math.sqrt(Math.max(0, r * r - rho2));
            z = pos.z + r - Math.sign(r || 1) * root;
          }
          return [pos.x + x, pos.y + y, z];
        },
        capRadius,
        radialSegments,
        angularSegments,
      ),
    ];
  }

  if (type === 'aspherical') {
    const r = Number(surface.r);
    const conic = Number(surface.conic ?? 0);
    const curvature = Math.abs(r) > 1e-12 ? 1 / r : 0;
    return [
      buildDiskMeshData(
        (x, y) => {
          const rho2 = x * x + y * y;
          let sag = 0;
          if (Math.abs(curvature) > 0) {
            const b = 1 - (1 + conic) * curvature * curvature * rho2;
            const sqrtB = Math.sqrt(Math.max(0, b));
            const denom = 1 + sqrtB;
            sag = Math.abs(denom) < 1e-12 ? 0 : (curvature * rho2) / denom;
          }
          return [pos.x + x, pos.y + y, pos.z + sag];
        },
        safeRadius,
        radialSegments,
        angularSegments,
      ),
    ];
  }

  if (type === 'toric') {
    const rAxis = Number(surface.r_axis);
    const rPerp = Number(surface.r_perp);
    const axisDeg = Number(surface.tilt?.y ?? 0);
    const axisRad = (axisDeg * Math.PI) / 180;
    const c = Math.cos(axisRad);
    const s = Math.sin(axisRad);
    const cu = !Number.isFinite(rAxis) || Math.abs(rAxis) > 1e12 ? 0 : 1 / rAxis;
    const cv = !Number.isFinite(rPerp) || Math.abs(rPerp) > 1e12 ? 0 : 1 / rPerp;

    return [
      buildDiskMeshData(
        (x, y) => {
          const u = c * x + s * y;
          const v = -s * x + c * y;
          const a = cu * u * u + cv * v * v;
          const b = 1 - cu * cu * u * u - cv * cv * v * v;
          const sqrtB = Math.sqrt(Math.max(0, b));
          const den = 1 + sqrtB;
          const sag = Math.abs(den) < 1e-12 ? 0 : a / den;
          return [pos.x + x, pos.y + y, pos.z + sag];
        },
        safeRadius,
        radialSegments,
        angularSegments,
      ),
    ];
  }

  return [
    buildDiskMeshData(
      (x, y) => [pos.x + x, pos.y + y, pos.z],
      safeRadius,
      radialSegments,
      angularSegments,
    ),
  ];
}

function buildSurfacePointSampler(
  surface: SurfaceLike,
): ((x: number, y: number) => THREE.Vector3) | null {
  const type = String(surface.type ?? '').toLowerCase();
  const pos = readSurfacePosition(surface);

  if (type === 'paraxial') {
    return (x, y) => new THREE.Vector3(pos.x + x, pos.y + y, pos.z);
  }

  if (type === 'spherical' || type === 'spherical-image') {
    const isImageSurface = type === 'spherical-image';
    const imageRadius = surface.radius ?? surface.r;
    const r = Number(isImageSurface ? imageRadius : surface.r);
    const planar = !Number.isFinite(r) || Math.abs(r) > 1e12;
    return (x, y) => {
      const rho2 = x * x + y * y;
      let z = pos.z;
      if (!planar && Math.abs(r) * Math.abs(r) >= rho2) {
        const root = Math.sqrt(Math.max(0, r * r - rho2));
        z = pos.z + r - Math.sign(r || 1) * root;
      }
      return new THREE.Vector3(pos.x + x, pos.y + y, z);
    };
  }

  if (type === 'aspherical') {
    const r = Number(surface.r);
    const conic = Number(surface.conic ?? 0);
    const curvature = Math.abs(r) > 1e-12 ? 1 / r : 0;
    return (x, y) => {
      const rho2 = x * x + y * y;
      let sag = 0;
      if (Math.abs(curvature) > 0) {
        const b = 1 - (1 + conic) * curvature * curvature * rho2;
        const sqrtB = Math.sqrt(Math.max(0, b));
        const denom = 1 + sqrtB;
        sag = Math.abs(denom) < 1e-12 ? 0 : (curvature * rho2) / denom;
      }
      return new THREE.Vector3(pos.x + x, pos.y + y, pos.z + sag);
    };
  }

  if (type === 'toric') {
    const rAxis = Number(surface.r_axis);
    const rPerp = Number(surface.r_perp);
    const axisDeg = Number(surface.tilt?.y ?? 0);
    const axisRad = (axisDeg * Math.PI) / 180;
    const c = Math.cos(axisRad);
    const s = Math.sin(axisRad);
    const cu = !Number.isFinite(rAxis) || Math.abs(rAxis) > 1e12 ? 0 : 1 / rAxis;
    const cv = !Number.isFinite(rPerp) || Math.abs(rPerp) > 1e12 ? 0 : 1 / rPerp;
    return (x, y) => {
      const u = c * x + s * y;
      const v = -s * x + c * y;
      const a = cu * u * u + cv * v * v;
      const b = 1 - cu * cu * u * u - cv * cv * v * v;
      const sqrtB = Math.sqrt(Math.max(0, b));
      const den = 1 + sqrtB;
      const sag = Math.abs(den) < 1e-12 ? 0 : a / den;
      return new THREE.Vector3(pos.x + x, pos.y + y, pos.z + sag);
    };
  }

  return null;
}

function pickAnteriorRenderableSurface(surface: SurfaceLike): SurfaceLike {
  const type = String(surface.type ?? '').toLowerCase();
  if (type !== 'compound') return surface;
  const candidates = [
    surface.front,
    (surface as SurfaceLike & { toricSurface?: SurfaceLike }).toricSurface,
    (surface as SurfaceLike & { sphericalSurface?: SurfaceLike }).sphericalSurface,
    surface.back,
  ].filter((part): part is SurfaceLike => Boolean(part));
  const renderable = candidates.filter((part) => Boolean(buildSurfacePointSampler(part)));
  if (!renderable.length) return surface;
  return renderable.reduce((best, current) =>
    readSurfacePosition(current).z < readSurfacePosition(best).z ? current : best,
  );
}

function buildClosedPairGeometry(
  front: SurfaceLike,
  back: SurfaceLike,
  radius: number,
): MeshBufferData | null {
  const radialSegments = 24;
  const angularSegments = 64;
  const safeRadius = Math.max(0, radius);
  if (!Number.isFinite(safeRadius) || safeRadius <= 0) return null;

  const frontSampler = buildSurfacePointSampler(front);
  const backSampler = buildSurfacePointSampler(back);
  if (!frontSampler || !backSampler) return null;

  const frontCap = buildDiskMeshData(
    (x, y) => {
      const p = frontSampler(x, y);
      return [p.x, p.y, p.z];
    },
    safeRadius,
    radialSegments,
    angularSegments,
  );
  const backCap = reverseWinding(
    buildDiskMeshData(
      (x, y) => {
        const p = backSampler(x, y);
        return [p.x, p.y, p.z];
      },
      safeRadius,
      radialSegments,
      angularSegments,
    ),
  );

  const sidePositions: number[] = [];
  const sideIndices: number[] = [];
  for (let seg = 0; seg < angularSegments; seg += 1) {
    const theta = (2 * Math.PI * seg) / angularSegments;
    const x = safeRadius * Math.cos(theta);
    const y = safeRadius * Math.sin(theta);
    const frontPoint = frontSampler(x, y);
    const backPoint = backSampler(x, y);
    sidePositions.push(frontPoint.x, frontPoint.y, frontPoint.z);
    sidePositions.push(backPoint.x, backPoint.y, backPoint.z);
  }

  for (let seg = 0; seg < angularSegments; seg += 1) {
    const next = (seg + 1) % angularSegments;
    const f0 = seg * 2;
    const b0 = seg * 2 + 1;
    const f1 = next * 2;
    const b1 = next * 2 + 1;
    sideIndices.push(f0, b0, f1, f1, b0, b1);
  }

  const sideBuffer: MeshBufferData = {
    positions: new Float32Array(sidePositions),
    indices: new Uint32Array(sideIndices),
  };

  return mergeMeshBuffers([frontCap, backCap, sideBuffer]);
}

/** SCAX surface들을 three mesh로 변환하는 모듈 함수 */
export function buildSurfaceMeshes(
  surfaces: SurfaceLike[],
  options?: {
    resolveRadius?: (surface: SurfaceLike, index: number) => number | undefined;
    colorTheme?: ScaxColorTheme;
  },
): THREE.Object3D[] {
  const colorTheme = options?.colorTheme ?? defaultScaxColorTheme();
  const meshes: THREE.Object3D[] = [];
  const consumed = new Set<number>();
  const findPairIndex = (targetName: string) =>
    surfaces.findIndex(
      (surface, index) =>
        !consumed.has(index) && String(surface?.name ?? '').toLowerCase() === targetName,
    );

  for (let index = 0; index < surfaces.length; index += 1) {
    if (consumed.has(index)) continue;
    const surface = surfaces[index];
    const type = String(surface.type ?? 'surface');
    const name = String(surface.name ?? `${type}-${index}`);
    const color = surfaceColor(type, name, colorTheme);
    const lowerName = name.toLowerCase();
    const isPupilStop = lowerName === 'pupil_stop';
    const resolvedRadius = options?.resolveRadius?.(surface, index);
    const baseRadius = Number.isFinite(resolvedRadius ?? Number.NaN)
      ? (resolvedRadius as number)
      : estimateSurfaceRadius(surface);

    if (lowerName === 'cornea_anterior' || lowerName === 'lens_anterior') {
      const pairName = lowerName.replace('_anterior', '_posterior');
      const pairIndex = findPairIndex(pairName);
      if (pairIndex >= 0) {
        const pairSurface = surfaces[pairIndex];
        const pairResolvedRadius = options?.resolveRadius?.(pairSurface, pairIndex);
        const pairRadius = Number.isFinite(pairResolvedRadius ?? Number.NaN)
          ? (pairResolvedRadius as number)
          : estimateSurfaceRadius(pairSurface);
        const closedBuffer = buildClosedPairGeometry(
          surface,
          pairSurface,
          Math.max(baseRadius, pairRadius),
        );
        if (closedBuffer) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(closedBuffer.positions, 3));
          geometry.setIndex(new THREE.BufferAttribute(closedBuffer.indices, 1));
          geometry.computeVertexNormals();

          const material = new THREE.MeshStandardMaterial({
            color,
            metalness: 0.05,
            roughness: 0.7,
            transparent: true,
            opacity: isPupilStop ? 0.95 : 0.5,
            depthWrite: false,
            side: THREE.DoubleSide,
          });

          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = `${name}-closed`;
          meshes.push(mesh);
          consumed.add(index);
          consumed.add(pairIndex);
          continue;
        }
      }
    }

    const buffers = buildGeometryForSurface(surface, baseRadius);

    for (let bufferIndex = 0; bufferIndex < buffers.length; bufferIndex += 1) {
      const buffer = buffers[bufferIndex];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(buffer.positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(buffer.indices, 1));
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.05,
        roughness: 0.7,
        transparent: true,
        opacity: isPupilStop ? 0.95 : 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${name}-${bufferIndex}`;
      meshes.push(mesh);
    }
  }

  return meshes;
}

export function buildRayObjects(rays: unknown[]): THREE.Object3D[] {
  const colorTheme = defaultScaxColorTheme();
  return buildRayObjectsWithTheme(rays, colorTheme);
}

function buildRayObjectsWithTheme(rays: unknown[], colorTheme: ScaxColorTheme): THREE.Object3D[] {
  return rays.flatMap((ray) => {
    const points = getRayPoints(ray).filter(isFiniteVector3);
    if (points.length < 2) return [];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: Number.isFinite((ray as { displayColor?: number }).displayColor)
        ? (ray as { displayColor?: number }).displayColor
        : 0xfbbf24,
      transparent: true,
      opacity: 0.9,
    });
    return [new THREE.Line(geometry, material)];
  });
}

export function buildLightSourceObjects(sourceRays: unknown[]): THREE.Object3D[] {
  const colorTheme = defaultScaxColorTheme();
  return buildLightSourceObjectsWithTheme(sourceRays, colorTheme);
}

function buildLightSourceObjectsWithTheme(
  sourceRays: unknown[],
  _colorTheme: ScaxColorTheme,
): THREE.Object3D[] {
  const uniqueOrigins = new Map<string, { origin: THREE.Vector3; colors: Set<number> }>();
  const defaultColor = new THREE.Color(0xfbbf24).getHex();
  for (const ray of sourceRays) {
    const origin = getRayPoints(ray)[0];
    if (!isFiniteVector3(origin)) continue;
    const key = `${origin.x.toFixed(6)}|${origin.y.toFixed(6)}|${origin.z.toFixed(6)}`;
    if (!uniqueOrigins.has(key)) {
      uniqueOrigins.set(key, { origin: origin.clone(), colors: new Set<number>() });
    }
    const rayColor = Number((ray as { displayColor?: number }).displayColor);
    uniqueOrigins.get(key)?.colors.add(Number.isFinite(rayColor) ? rayColor : defaultColor);
  }

  const markers: THREE.Object3D[] = [];
  for (const item of uniqueOrigins.values()) {
    const colors = item.colors.size > 0 ? [...item.colors] : [defaultColor];
    const geometry = new THREE.SphereGeometry(0.2, 12, 10);
    if (colors.length === 1) {
      const material = new THREE.MeshBasicMaterial({
        color: colors[0],
        transparent: true,
        opacity: 0.95,
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(item.origin);
      markers.push(marker);
      continue;
    }

    const offsetRadius = 0.14;
    for (let index = 0; index < colors.length; index += 1) {
      const theta = (2 * Math.PI * index) / colors.length;
      const material = new THREE.MeshBasicMaterial({
        color: colors[index],
        transparent: true,
        opacity: 0.95,
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.set(
        item.origin.x + offsetRadius * Math.cos(theta),
        item.origin.y + offsetRadius * Math.sin(theta),
        item.origin.z,
      );
      markers.push(marker);
    }
  }

  return markers;
}

@customElement('scax-wc')
export class ScaxWc extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      aspect-ratio: 16 / 9;
      border: 1px solid var(--scax-host-border-color, #d1d5db);
      border-radius: 12px;
      overflow: hidden;
      background: var(--scax-host-background-color, #111827);
    }

    #canvas-root {
      position: relative;
      width: 100%;
      height: 100%;
    }
  `;

  /**
   * HTML: <scax-simulator config='{"eye":{"s":-2,"c":0,"ax":0}}'></scax-simulator>
   * 빈 문자열/미설정 → 기본값
   */
  @property({
    attribute: 'config',
    type: String,
    converter: {
      fromAttribute(value: string | null): ScaxRenderConfig {
        return parseConfigAttribute(value);
      },
      toAttribute(value: ScaxRenderConfig): string {
        return JSON.stringify(value);
      },
    },
    /** 객체 비교 대신 매번 갱신하려면 주석 해제 */
    // hasChanged: () => true,
  })
  config: ScaxRenderConfig = mergeScaxConfig({});

  @property({
    attribute: 'color',
    type: String,
    converter: {
      fromAttribute(value: string | null): ScaxColorTheme {
        return parseColorAttribute(value);
      },
      toAttribute(value: ScaxColorTheme): string {
        return JSON.stringify(value);
      },
    },
  })
  color: ScaxColorTheme = mergeScaxColorTheme({});

  @property({ attribute: 'projection' })
  projection?: CameraProjection;

  @property({ attribute: 'enable-zoom', type: Boolean })
  enableZoom?: boolean;

  @property({ attribute: 'enable-pan', type: Boolean })
  enablePan?: boolean;

  @property({ attribute: 'enable-rotate', type: Boolean })
  enableRotate?: boolean;

  private scene?: THREE.Scene;
  private viewCamera?: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private ambientLight?: THREE.AmbientLight;
  private directionalLight?: THREE.DirectionalLight;
  private animationId?: number;
  private engine?: SCAXEngine;
  private surfaceMeshes: THREE.Object3D[] = [];
  private rayObjects: THREE.Object3D[] = [];
  private lightSourceObjects: THREE.Object3D[] = [];
  private sturmObjects: THREE.Object3D[] = [];
  private meridianObjects: THREE.Object3D[] = [];
  private hasInitialCameraFit = false;
  private lastSimulationResult: unknown = null;
  private lastSturmResult: unknown = null;
  private lastAffineResult: AffineResultLike | null = null;

  render() {
    return html` <div id="canvas-root"></div> `;
  }

  firstUpdated(): void {
    this.bootstrapScene();
    this.applyColorTheme();
    this.bootstrapEngine();
    this.refreshSimulationScene();
    window.addEventListener('resize', this.handleResize);
    this.startRenderLoop();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('projection')) {
      this.rebuildCameraFromOptions();
    }
    if (changed.has('enableZoom') || changed.has('enablePan') || changed.has('enableRotate')) {
      this.applyOrbitControlState();
    }
    const colorChanged = changed.has('color');
    if (colorChanged) {
      this.applyColorTheme();
    }
    if (!changed.has('config')) {
      if (colorChanged && this.scene) this.refreshSimulationScene();
      return;
    }
    if (!this.scene) return;

    this.syncEngineConfig();
    this.refreshSimulationScene();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.teardownScene();
  }

  private renderLoop = () => {
    if (!this.scene || !this.viewCamera || !this.renderer) return;
    this.controls?.update();
    this.renderer.render(this.scene, this.viewCamera);
    this.animationId = requestAnimationFrame(this.renderLoop);
  };

  private startRenderLoop(): void {
    this.stopRenderLoop();
    this.renderLoop();
  }

  private stopRenderLoop(): void {
    if (this.animationId === undefined) return;
    cancelAnimationFrame(this.animationId);
    this.animationId = undefined;
  }

  private bootstrapScene(): void {
    const root = this.getCanvasRoot();
    if (!root) return;
    this.scene = this.createScene();
    this.renderer = this.createRenderer(root);
    this.initializeCameraAndControls(root);
    this.addDefaultLights();
  }

  private getCanvasRoot(): HTMLDivElement | null {
    return this.renderRoot.querySelector('#canvas-root') as HTMLDivElement | null;
  }

  private createScene(): THREE.Scene {
    const colorTheme = this.getColorTheme();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(colorTheme.scene.background);
    return scene;
  }

  private createRenderer(root: HTMLDivElement): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(root.clientWidth, root.clientHeight);
    root.append(renderer.domElement);
    return renderer;
  }

  private addDefaultLights(): void {
    if (!this.scene) return;
    this.directionalLight = new THREE.DirectionalLight('#ffffff', 0.8);
    this.directionalLight.position.set(80, -60, 100);
    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.7);
    this.scene.add(this.ambientLight, this.directionalLight);
  }

  private bootstrapEngine(): void {
    this.engine = new SCAXEngine(this.config);
  }

  private syncEngineConfig(): void {
    if (!this.engine) {
      this.bootstrapEngine();
      return;
    }
    this.engine.update(this.config);
  }

  private refreshSimulationScene(): void {
    const simulationData = this.runSimulationPipeline();
    if (!simulationData) return;
    this.rebuildSceneMeshes(
      simulationData.tracedRays,
      simulationData.sourceRays,
      simulationData.sturmInfo,
      simulationData.lensAstigmatism,
      simulationData.combinedAstigmatism,
    );
  }

  private runSimulationPipeline(): {
    tracedRays: unknown[];
    sourceRays: unknown[];
    sturmInfo: SturmInfoLike[];
    lensAstigmatism: AstigmatismSummaryItem[];
    combinedAstigmatism: AstigmatismSummaryItem;
  } | null {
    if (!this.engine) return null;
    const simulationResult = this.engine.simulate();
    this.lastSimulationResult = simulationResult;
    const tracedRays = Array.isArray(simulationResult?.traced_rays)
      ? simulationResult.traced_rays
      : [];
    const sturmResult = this.engine.sturmCalculation(tracedRays);
    this.lastSturmResult = sturmResult;
    const sturmInfo = Array.isArray((sturmResult as { sturm_info?: unknown[] } | null)?.sturm_info)
      ? ((sturmResult as { sturm_info?: unknown[] }).sturm_info as SturmInfoLike[])
      : [];
    const lensAstigmatism = Array.isArray(
      (simulationResult as SimulateResult | null)?.info?.astigmatism?.lens,
    )
      ? ((simulationResult as SimulateResult).info.astigmatism.lens ?? [])
      : [];
    const combinedAstigmatism = Array.isArray(
      (simulationResult as SimulateResult | null)?.info?.astigmatism?.combined?.[0],
    )
      ? ((simulationResult as SimulateResult).info.astigmatism.combined?.[0] ?? [])
      : [];
    this.lastAffineResult = this.calculateAffineResult();
    // traced ray의 첫 점은 엔진의 광원 pose(position/tilt)가 반영된 실제 발광 위치입니다.
    const sourceRays = tracedRays;
    return { tracedRays, sourceRays, sturmInfo, lensAstigmatism, combinedAstigmatism };
  }

  private teardownScene(): void {
    this.stopRenderLoop();
    window.removeEventListener('resize', this.handleResize);
    this.clearAllRenderableGroups();
    this.controls?.dispose();
    this.controls = undefined;
    this.renderer?.dispose();
    this.renderer = undefined;
    this.viewCamera = undefined;
    this.ambientLight = undefined;
    this.directionalLight = undefined;
    this.scene = undefined;
  }

  private clearAllRenderableGroups(): void {
    this.clearSceneObjects(this.surfaceMeshes);
    this.clearSceneObjects(this.rayObjects);
    this.clearSceneObjects(this.lightSourceObjects);
    this.clearSceneObjects(this.sturmObjects);
    this.clearSceneObjects(this.meridianObjects);
  }

  public getSimulateResult<T = unknown>(): T | null {
    return (this.lastSimulationResult as T | null) ?? null;
  }

  public getSturmResult<T = unknown>(): T | null {
    return (this.lastSturmResult as T | null) ?? null;
  }

  public getAffineResult(): AffineResultLike | null {
    return this.lastAffineResult;
  }

  public setCameraState(state: CameraStateInput): void {
    const nextProjection = isCameraProjection(state.projection)
      ? state.projection
      : (this.getEffectiveCameraOptions().projection ?? 'perspective');
    const hasProjectionChanged = this.projection !== nextProjection;
    this.projection = nextProjection;
    const applyState = () => {
      if (this.viewCamera) {
        const currentPose = this.captureCurrentCameraPose();
        const fallbackPosition = currentPose?.position ?? this.getCameraPositionFromOptions();
        const fallbackTarget = currentPose?.target ?? this.getCameraLookAtFromOptions();
        const nextPosition = this.resolveCameraVector(state.position, fallbackPosition);
        const nextTarget = this.resolveCameraVector(state.target, fallbackTarget);
        this.applyCameraPose({ position: nextPosition, target: nextTarget });
        this.controls?.update();
      }
      this.applyCameraZoom(state.zoom);
    };
    if (hasProjectionChanged) {
      requestAnimationFrame(() => applyState());
      return;
    }
    applyState();
  }

  public getCameraState(): CameraStateSnapshot {
    const currentPose = this.captureCurrentCameraPose();
    const position = currentPose?.position ?? this.getCameraPositionFromOptions();
    const target = currentPose?.target ?? this.getCameraLookAtFromOptions();
    return {
      projection: this.getEffectiveCameraOptions().projection ?? 'perspective',
      position: { x: position.x, y: position.y, z: position.z },
      target: { x: target.x, y: target.y, z: target.z },
      zoom: this.captureCurrentCameraZoom(),
    };
  }

  private rebuildSceneMeshes(
    tracedRays: unknown[],
    sourceRays: unknown[],
    sturmInfo: SturmInfoLike[],
    lensAstigmatism: AstigmatismSummaryItem[],
    combinedAstigmatism: AstigmatismSummaryItem,
  ) {
    if (!this.scene || !this.engine) return;
    const colorTheme = this.getColorTheme();

    this.clearAllRenderableGroups();

    const state = this.engine as unknown as EngineStateLike;
    const lensSurfaces = Array.isArray(state.lens) ? state.lens : [];
    const eyeSurfaces = Array.isArray(state.surfaces) ? state.surfaces : [];
    const ordered = [...lensSurfaces, ...eyeSurfaces]
      .filter((surface) => {
        const renderPupil = Boolean(this.config?.render?.pupil);
        const lowerType = String(surface?.type ?? '').toLowerCase();
        const lowerName = String(surface?.name ?? '').toLowerCase();
        const isPupilSurface = lowerName === 'pupil_stop' || lowerType === 'aperture_stop';
        if (isPupilSurface) return renderPupil;
        return true;
      })
      .sort((a, b) => readSurfacePosition(a).z - readSurfacePosition(b).z);
    const corneaSurface = eyeSurfaces.find(
      (surface) => String(surface?.name ?? '').toLowerCase() === 'eye_st',
    );
    const corneaAstigSurface = corneaSurface
      ? String(corneaSurface.type ?? '').toLowerCase() === 'compound'
        ? pickAnteriorRenderableSurface(corneaSurface)
        : corneaSurface
      : undefined;
    const baseCorneaAxis = Number(corneaAstigSurface?.ax ?? 0);
    const firstAstigmaticSturm = sturmInfo.find((item) => Boolean(item?.has_astigmatism));
    const inducedAxisFromSturm = Number(
      firstAstigmaticSturm?.anterior?.profile?.angleMajorDeg ??
        firstAstigmaticSturm?.posterior?.profile?.angleMajorDeg,
    );
    const hasInsertedLens = lensSurfaces.length > 0;
    const hasInducedAstigmatism = hasInsertedLens && Number.isFinite(inducedAxisFromSturm);
    const activeCorneaAxisFromSturm = hasInducedAstigmatism
      ? normalizeAxis180(inducedAxisFromSturm + 90)
      : normalizeAxis180(baseCorneaAxis);
    const combinedMeridians = combinedAstigmatism.filter(
      (item) => Number.isFinite(Number(item?.d)) && Number.isFinite(Number(item?.tabo)),
    );
    const [combinedWeakMeridian, combinedStrongMeridian] = [...combinedMeridians].sort(
      (a, b) => Number(a.d) - Number(b.d),
    );
    const combinedWeakAxis = Number.isFinite(Number(combinedWeakMeridian?.tabo))
      ? normalizeAxis180(taboToDeg(Number(combinedWeakMeridian?.tabo)))
      : activeCorneaAxisFromSturm;
    const combinedStrongAxis = Number.isFinite(Number(combinedStrongMeridian?.tabo))
      ? normalizeAxis180(taboToDeg(Number(combinedStrongMeridian?.tabo)))
      : normalizeAxis180(combinedWeakAxis + 90);

    const lensRadiusBySurface = new Map<SurfaceLike, number>();
    const configLenses = Array.isArray(this.config?.lens) ? this.config.lens : [];
    for (let i = 0; i < lensSurfaces.length; i += 1) {
      const lensSurface = lensSurfaces[i];
      const lensDiameter = Number(configLenses[i]?.diameter);
      if (!Number.isFinite(lensDiameter) || lensDiameter <= 0) continue;
      lensRadiusBySurface.set(lensSurface, lensDiameter / 2);
    }

    this.surfaceMeshes = buildSurfaceMeshes(ordered, {
      resolveRadius: (surface) => lensRadiusBySurface.get(surface),
      colorTheme,
    });
    for (const mesh of this.surfaceMeshes) {
      this.scene.add(mesh);
    }
    this.rayObjects = buildRayObjectsWithTheme(tracedRays, colorTheme);
    for (const object of this.rayObjects) {
      this.scene.add(object);
    }

    this.lightSourceObjects = buildLightSourceObjectsWithTheme(sourceRays, colorTheme);
    for (const object of this.lightSourceObjects) {
      this.scene.add(object);
    }

    this.sturmObjects = this.buildSturmObject(sturmInfo, combinedAstigmatism);
    for (const object of this.sturmObjects) {
      this.scene.add(object);
    }

    const meridianObjects: THREE.Object3D[] = [];
    for (let lensIndex = 0; lensIndex < lensSurfaces.length; lensIndex += 1) {
      const surface = lensSurfaces[lensIndex];
      if (!surface) continue;
      const lensConfig = configLenses[lensIndex] ?? null;
      const lensType = String(lensConfig?.type ?? 'lens').toLowerCase();
      const parts = [pickAnteriorRenderableSurface(surface)];
      const simulatedMeridians = Array.isArray(lensAstigmatism[lensIndex])
        ? lensAstigmatism[lensIndex].filter(
            (item): item is AstigmatismSummaryItem[number] =>
              Boolean(item) &&
              Number.isFinite(Number(item.d)) &&
              Number.isFinite(Number(item.tabo)),
          )
        : [];
      const [simWeakMeridian, simStrongMeridian] = [...simulatedMeridians].sort(
        (a, b) => Number(a.d) - Number(b.d),
      );
      for (const part of parts) {
        const axisDeg = Number.isFinite(Number(simWeakMeridian?.tabo))
          ? taboToDeg(Number(simWeakMeridian?.tabo))
          : Number(part.ax ?? surface.ax ?? 0);
        const halfLength = Math.max(2.5, estimateSurfaceRadius(part) * 0.9);
        const weakMeridianPower = Number.isFinite(Number(simWeakMeridian?.d))
          ? Number(simWeakMeridian?.d)
          : Number(lensConfig?.s ?? 0);
        const strongMeridianPower = Number.isFinite(Number(simStrongMeridian?.d))
          ? Number(simStrongMeridian?.d)
          : weakMeridianPower + Number(lensConfig?.c ?? 0);
        let plusAxis = weakMeridianPower >= strongMeridianPower ? axisDeg : axisDeg + 90;
        let minusAxis = weakMeridianPower < strongMeridianPower ? axisDeg : axisDeg + 90;

        if (lensType === 'cross-cylinder') {
          const configuredAxisDeg = Number(lensConfig?.ax ?? part.ax ?? surface.ax ?? 0);
          const configuredAxisPower = Number(lensConfig?.s ?? 0);
          const configuredOrthogonalPower = configuredAxisPower + Number(lensConfig?.c ?? 0);
          const axisHasPlus = configuredAxisPower > 0;
          const orthogonalHasPlus = configuredOrthogonalPower > 0;
          const axisHasMinus = configuredAxisPower < 0;
          const orthogonalHasMinus = configuredOrthogonalPower < 0;

          // Cross-cylinder: marker polarity should follow meridian sign (+/-), not strong/weak ordering.
          if (axisHasPlus !== orthogonalHasPlus && axisHasMinus !== orthogonalHasMinus) {
            plusAxis = axisHasPlus ? configuredAxisDeg : configuredAxisDeg + 90;
            minusAxis = axisHasMinus ? configuredAxisDeg : configuredAxisDeg + 90;
          } else {
            plusAxis =
              configuredAxisPower >= configuredOrthogonalPower
                ? configuredAxisDeg
                : configuredAxisDeg + 90;
            minusAxis =
              configuredAxisPower < configuredOrthogonalPower
                ? configuredAxisDeg
                : configuredAxisDeg + 90;
          }

          const bisectorA = this.createMeridianDashedLine(
            part,
            plusAxis + 45,
            halfLength,
            colorTheme.cross_cylinder.bisector,
            LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
          );
          const bisectorB = this.createMeridianDashedLine(
            part,
            plusAxis + 135,
            halfLength,
            colorTheme.cross_cylinder.bisector,
            LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
          );
          if (bisectorA) meridianObjects.push(bisectorA);
          if (bisectorB) meridianObjects.push(bisectorB);
          const plusMeridian = this.createMeridianLine(
            part,
            plusAxis,
            halfLength,
            colorTheme.cross_cylinder.plus,
            LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
          );
          const minusMeridian = this.createMeridianLine(
            part,
            minusAxis,
            halfLength,
            colorTheme.cross_cylinder.minus,
            LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
          );
          if (plusMeridian) meridianObjects.push(plusMeridian);
          if (minusMeridian) meridianObjects.push(minusMeridian);
          meridianObjects.push(
            ...this.createMeridianEndpointMarkers(
              part,
              plusAxis,
              halfLength,
              colorTheme.cross_cylinder.plusMarker,
              LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
            ),
          );
          meridianObjects.push(
            ...this.createMeridianEndpointMarkers(
              part,
              minusAxis,
              halfLength,
              colorTheme.cross_cylinder.minusMarker,
              LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
            ),
          );
          meridianObjects.push(
            ...this.createMeridianEndpointMarkers(
              part,
              plusAxis + 45,
              halfLength,
              colorTheme.cross_cylinder.bisector,
              LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
            ),
          );
          meridianObjects.push(
            ...this.createMeridianEndpointMarkers(
              part,
              plusAxis + 135,
              halfLength,
              colorTheme.cross_cylinder.bisector,
              LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
            ),
          );
          continue;
        }

        const major = this.createMeridianLine(
          part,
          axisDeg,
          halfLength,
          colorTheme.meridian.lens.weak,
          LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
        );
        const minor = this.createMeridianLine(
          part,
          axisDeg + 90,
          halfLength,
          colorTheme.meridian.lens.strong,
          LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
        );
        if (major) meridianObjects.push(major);
        if (minor) meridianObjects.push(minor);
      }
    }

    if (corneaAstigSurface) {
      const halfLength = Math.max(2.5, estimateSurfaceRadius(corneaAstigSurface) * 0.9);
      const activeMajor = this.createMeridianLine(
        corneaAstigSurface,
        combinedWeakAxis,
        halfLength,
        colorTheme.meridian.combined.weak,
        CORNEA_MERIDIAN_ANTERIOR_OFFSET_MM,
      );
      const activeMinor = this.createMeridianLine(
        corneaAstigSurface,
        combinedStrongAxis,
        halfLength,
        colorTheme.meridian.combined.strong,
        CORNEA_MERIDIAN_ANTERIOR_OFFSET_MM,
      );
      if (activeMajor) meridianObjects.push(activeMajor);
      if (activeMinor) meridianObjects.push(activeMinor);

      if (hasInducedAstigmatism) {
        const baseMajor = this.createMeridianDashedLine(
          corneaAstigSurface,
          baseCorneaAxis,
          halfLength,
          colorTheme.meridian.eye.strong,
          CORNEA_MERIDIAN_ANTERIOR_OFFSET_MM,
        );
        const baseMinor = this.createMeridianDashedLine(
          corneaAstigSurface,
          baseCorneaAxis + 90,
          halfLength,
          colorTheme.meridian.eye.weak,
          CORNEA_MERIDIAN_ANTERIOR_OFFSET_MM,
        );
        if (baseMajor) meridianObjects.push(baseMajor);
        if (baseMinor) meridianObjects.push(baseMinor);
      }
    }
    this.meridianObjects = meridianObjects;
    for (const line of this.meridianObjects) {
      this.scene.add(line);
    }

    if ((this.getEffectiveCameraOptions().autoFit ?? false) && !this.hasInitialCameraFit) {
      this.fitCameraToObjects(this.getCameraFitObjects());
      this.hasInitialCameraFit = true;
    }
  }

  private getCameraFitObjects(): THREE.Object3D[] {
    return [
      ...this.surfaceMeshes,
      ...this.rayObjects,
      ...this.lightSourceObjects,
      ...this.sturmObjects,
      ...this.meridianObjects,
    ];
  }

  private calculateAffineResult(): AffineResultLike | null {
    if (!this.engine) return null;
    return (
      (
        this.engine as unknown as {
          getAffineAnalysis?: () => AffineResultLike | null;
        }
      ).getAffineAnalysis?.() ?? null
    );
  }

  private createMeridianLine(
    surface: SurfaceLike,
    axisDeg: number,
    halfLength: number,
    color: THREE.ColorRepresentation,
    zOffsetMm = 0,
  ): THREE.Line | null {
    const sampler = buildSurfacePointSampler(surface);
    if (!sampler) return null;
    const axisRad = (axisDeg * Math.PI) / 180;
    const c = Math.cos(axisRad);
    const s = Math.sin(axisRad);
    const p0 = sampler(-c * halfLength, -s * halfLength);
    const p1 = sampler(c * halfLength, s * halfLength);
    if (zOffsetMm !== 0) {
      p0.z += zOffsetMm;
      p1.z += zOffsetMm;
    }
    const geometry = new THREE.BufferGeometry().setFromPoints([p0, p1]);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 10;
    return line;
  }

  private createMeridianDashedLine(
    surface: SurfaceLike,
    axisDeg: number,
    halfLength: number,
    color: THREE.ColorRepresentation,
    zOffsetMm = 0,
  ): THREE.Line | null {
    const sampler = buildSurfacePointSampler(surface);
    if (!sampler) return null;
    const axisRad = (axisDeg * Math.PI) / 180;
    const c = Math.cos(axisRad);
    const s = Math.sin(axisRad);
    const p0 = sampler(-c * halfLength, -s * halfLength);
    const p1 = sampler(c * halfLength, s * halfLength);
    if (zOffsetMm !== 0) {
      p0.z += zOffsetMm;
      p1.z += zOffsetMm;
    }
    const geometry = new THREE.BufferGeometry().setFromPoints([p0, p1]);
    const material = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      dashSize: 0.5,
      gapSize: 0.35,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    line.renderOrder = 10;
    return line;
  }

  private createMeridianEndpointMarkers(
    surface: SurfaceLike,
    axisDeg: number,
    halfLength: number,
    color: THREE.ColorRepresentation,
    zOffsetMm = 0,
  ): THREE.Object3D[] {
    const sampler = buildSurfacePointSampler(surface);
    if (!sampler) return [];
    const axisRad = (axisDeg * Math.PI) / 180;
    const c = Math.cos(axisRad);
    const s = Math.sin(axisRad);
    const endpoints = [
      sampler(-c * halfLength, -s * halfLength),
      sampler(c * halfLength, s * halfLength),
    ];
    const markerLiftMm = 0.16;
    return endpoints.map((point, endpointIndex) => {
      const sign = endpointIndex === 0 ? -1 : 1;
      const normal = this.estimateSurfaceNormal(
        surface,
        sign * c * halfLength,
        sign * s * halfLength,
      );
      if (normal) {
        point.addScaledVector(normal, -markerLiftMm);
      } else if (zOffsetMm !== 0) {
        point.z += zOffsetMm;
      }
      const geometry = new THREE.SphereGeometry(0.22, 14, 12);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.98,
        depthTest: false,
        depthWrite: false,
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(point);
      marker.renderOrder = 11;
      return marker;
    });
  }

  private estimateSurfaceNormal(surface: SurfaceLike, x: number, y: number): THREE.Vector3 | null {
    const sampler = buildSurfacePointSampler(surface);
    if (!sampler) return null;
    const delta = 0.08;
    const center = sampler(x, y);
    const px = sampler(x + delta, y);
    const py = sampler(x, y + delta);
    const tx = px.sub(center);
    const ty = py.sub(center);
    const normal = tx.cross(ty);
    if (normal.lengthSq() < 1e-12) return null;
    return normal.normalize();
  }

  private fitCameraToObjects(objects: THREE.Object3D[]) {
    if (!this.viewCamera || !objects.length) return;
    const bounds = new THREE.Box3();
    for (const object of objects) {
      bounds.expandByObject(object);
    }
    if (bounds.isEmpty()) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxSize) || maxSize <= 0) return;

    const currentTarget = this.controls?.target.clone() ?? new THREE.Vector3(0, 0, 0);
    const viewDirection = this.viewCamera.position.clone().sub(currentTarget);
    if (viewDirection.lengthSq() < 1e-12) {
      viewDirection.set(1, 1, 1);
    }
    viewDirection.normalize();

    if (this.viewCamera instanceof THREE.PerspectiveCamera) {
      const verticalFovRad = THREE.MathUtils.degToRad(this.viewCamera.fov);
      const horizontalFovRad = 2 * Math.atan(Math.tan(verticalFovRad / 2) * this.viewCamera.aspect);
      const fitHeightDistance = maxSize / (2 * Math.tan(verticalFovRad / 2));
      const fitWidthDistance = maxSize / (2 * Math.tan(horizontalFovRad / 2));
      const fitOffset = 1.2;
      const distance = Math.max(fitHeightDistance, fitWidthDistance) * fitOffset;

      this.viewCamera.position.copy(center.clone().addScaledVector(viewDirection, distance));
      this.viewCamera.near = Math.max(0.01, distance / 100);
      this.viewCamera.far = Math.max(2000, distance * 100);
      this.viewCamera.updateProjectionMatrix();
    } else {
      const fitOffset = 1.4;
      const halfHeight = (maxSize * fitOffset) / 2;
      const aspect =
        this.renderer && this.renderer.domElement.clientHeight > 0
          ? this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight
          : 1;
      const halfWidth = halfHeight * aspect;
      const distance = Math.max(size.x, size.y, size.z) * 2;

      this.viewCamera.position.copy(center.clone().addScaledVector(viewDirection, distance));
      this.viewCamera.left = -halfWidth;
      this.viewCamera.right = halfWidth;
      this.viewCamera.top = halfHeight;
      this.viewCamera.bottom = -halfHeight;
      this.viewCamera.near = Math.max(0.01, distance / 100);
      this.viewCamera.far = Math.max(2000, distance * 100);
      this.viewCamera.updateProjectionMatrix();
    }
    this.controls?.target.copy(center);
    this.controls?.update();
  }

  private buildSturmObject(
    sturmInfo: SturmInfoLike[],
    combinedAstigmatism: AstigmatismSummaryItem,
  ): THREE.Object3D[] {
    const colorTheme = this.getColorTheme();
    const objects: THREE.Object3D[] = [];
    const corneaDiameterMm = 11.6;
    const combinedMeridians = combinedAstigmatism.filter(
      (item) => Number.isFinite(Number(item?.d)) && Number.isFinite(Number(item?.tabo)),
    );
    const [combinedWeak, combinedStrong] = [...combinedMeridians].sort(
      (a, b) => Number(a.d) - Number(b.d),
    );
    const strongAxisDeg = Number.isFinite(Number(combinedStrong?.tabo))
      ? normalizeAxis180(taboToDeg(Number(combinedStrong?.tabo)))
      : 0;
    const weakAxisDeg = Number.isFinite(Number(combinedWeak?.tabo))
      ? normalizeAxis180(taboToDeg(Number(combinedWeak?.tabo)))
      : 90;
    const strongFocalAxis = normalizeAxis180(strongAxisDeg + 90);
    const weakFocalAxis = normalizeAxis180(weakAxisDeg + 90);

    for (const item of sturmInfo) {
      const approxCenterPoint = toFinitePoint(item?.approx_center);
      const profiles = [item?.anterior?.profile, item?.posterior?.profile];
      const drawableProfiles = profiles
        .map((profile) => ({
          profile,
          center: toFinitePoint(profile?.at),
          angleDeg: Number(profile?.angleMajorDeg),
        }))
        .filter(
          (
            entry,
          ): entry is {
            profile: NonNullable<(typeof profiles)[number]>;
            center: THREE.Vector3;
            angleDeg: number;
          } => Boolean(entry.profile) && Boolean(entry.center) && Number.isFinite(entry.angleDeg),
        );

      for (let profileIndex = 0; profileIndex < drawableProfiles.length; profileIndex += 1) {
        const { center, angleDeg } = drawableProfiles[profileIndex];
        if (!center || !Number.isFinite(angleDeg)) continue;
        if (!item.has_astigmatism) continue;
        const dStrong = angleDistance180(angleDeg, strongFocalAxis);
        const dWeak = angleDistance180(angleDeg, weakFocalAxis);
        let color =
          dStrong <= dWeak ? colorTheme.meridian.combined.strong : colorTheme.meridian.combined.weak;
        // If focal axis matching is ambiguous, keep stronger power on nearer line.
        if (Math.abs(dStrong - dWeak) < 1e-6 && drawableProfiles.length >= 2) {
          const nearestIndex = drawableProfiles[0].center.z <= drawableProfiles[1].center.z ? 0 : 1;
          color =
            profileIndex === nearestIndex
              ? colorTheme.meridian.combined.strong
              : colorTheme.meridian.combined.weak;
        }
        objects.push(createOrientedLineObject(center, angleDeg, corneaDiameterMm, color));
      }

      if (approxCenterPoint) {
        const markerGeometry = new THREE.SphereGeometry(0.7, 16, 12);
        const markerMaterial = new THREE.MeshStandardMaterial({
          color: Number.isFinite(item?.color)
            ? (item.color as number)
            : 0x60a5fa,
          emissive: Number.isFinite(item?.color)
            ? (item.color as number)
            : 0x60a5fa,
          emissiveIntensity: 0.2,
          metalness: 0.05,
          roughness: 0.4,
        });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(approxCenterPoint);
        objects.push(marker);
      }
    }

    return objects;
  }

  private clearSceneObjects(objects: THREE.Object3D[]) {
    if (!this.scene) return;
    for (const object of objects) {
      this.scene.remove(object);
      const disposable = object as unknown as {
        geometry?: { dispose?: () => void };
        material?: { dispose?: () => void } | { dispose?: () => void }[];
      };
      disposable.geometry?.dispose?.();
      if (Array.isArray(disposable.material)) {
        for (const material of disposable.material) {
          material.dispose?.();
        }
      } else {
        disposable.material?.dispose?.();
      }
    }

    if (objects === this.surfaceMeshes) {
      this.surfaceMeshes = [];
    } else if (objects === this.rayObjects) {
      this.rayObjects = [];
    } else if (objects === this.lightSourceObjects) {
      this.lightSourceObjects = [];
    } else if (objects === this.sturmObjects) {
      this.sturmObjects = [];
    } else if (objects === this.meridianObjects) {
      this.meridianObjects = [];
    }
  }

  private applyColorTheme(): void {
    const colorTheme = this.getColorTheme();
    this.style.setProperty('--scax-host-border-color', '#d1d5db');
    this.style.setProperty('--scax-host-background-color', '#111827');
    if (this.scene) {
      this.scene.background = new THREE.Color(colorTheme.scene.background);
    }
    if (this.directionalLight) {
      this.directionalLight.color.set('#ffffff');
    }
    if (this.ambientLight) {
      this.ambientLight.color.set('#ffffff');
    }
  }

  private getColorTheme(): ScaxColorTheme {
    return mergeScaxColorTheme((this.color ?? null) as ScaxColorThemeInput | null);
  }

  private handleResize = () => {
    const root = this.getCanvasRoot();
    if (!root || !this.viewCamera || !this.renderer) return;

    const aspect = root.clientWidth / root.clientHeight;
    if (this.viewCamera instanceof THREE.PerspectiveCamera) {
      this.viewCamera.aspect = aspect;
      this.viewCamera.updateProjectionMatrix();
    } else {
      const currentHeight = this.viewCamera.top - this.viewCamera.bottom;
      const halfHeight = currentHeight / 2;
      const halfWidth = halfHeight * aspect;
      this.viewCamera.left = -halfWidth;
      this.viewCamera.right = halfWidth;
      this.viewCamera.updateProjectionMatrix();
    }
    this.renderer.setSize(root.clientWidth, root.clientHeight);
  };

  private initializeCameraAndControls(
    root: HTMLDivElement,
    poseOverride?: CameraPose,
    preserveViewScale = false,
  ): void {
    const previousCamera = this.viewCamera;
    if (!this.renderer) {
      this.viewCamera = this.createCamera(root);
      this.applyCameraPose(poseOverride);
      return;
    }
    this.viewCamera = this.createCamera(root);
    this.controls?.dispose();
    this.controls = new OrbitControls(this.viewCamera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // Avoid exact spherical pole singularities in OrbitControls.
    this.controls.minPolarAngle = 0.001;
    this.controls.maxPolarAngle = Math.PI - 0.001;
    this.applyOrbitControlState();
    this.applyCameraPose(poseOverride);
    if (preserveViewScale) {
      this.matchViewScaleAcrossProjectionChange(previousCamera, root, poseOverride?.target);
    }
    this.controls.update();
  }

  private createCamera(root: HTMLDivElement): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    const aspect = root.clientWidth / root.clientHeight;
    const projection = this.getEffectiveCameraOptions().projection ?? 'perspective';
    if (projection === 'orthogonal') {
      const frustumHalfHeight = 16;
      const frustumHalfWidth = frustumHalfHeight * aspect;
      return new THREE.OrthographicCamera(
        -frustumHalfWidth,
        frustumHalfWidth,
        frustumHalfHeight,
        -frustumHalfHeight,
        0.1,
        2000,
      );
    }
    return new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
  }

  private applyCameraPose(poseOverride?: CameraPose): void {
    if (!this.viewCamera) return;
    const target = poseOverride?.target ?? this.getCameraLookAtFromOptions();
    const position = poseOverride?.position ?? this.getCameraPositionFromOptions();
    this.viewCamera.position.copy(position);
    this.viewCamera.up.set(0, 1, 0);
    this.viewCamera.lookAt(target);
    this.viewCamera.updateProjectionMatrix();
    this.controls?.target.copy(target);
  }

  private rebuildCameraFromOptions(): void {
    const root = this.getCanvasRoot();
    if (!root) return;
    this.initializeCameraAndControls(root, this.captureCurrentCameraPose(), true);
  }

  private captureCurrentCameraPose(): CameraPose | undefined {
    if (!this.viewCamera) return undefined;
    return {
      position: this.viewCamera.position.clone(),
      target: this.controls?.target.clone() ?? this.getCameraLookAtFromOptions(),
    };
  }

  private matchViewScaleAcrossProjectionChange(
    previousCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera | undefined,
    root: HTMLDivElement,
    targetOverride?: THREE.Vector3,
  ): void {
    if (!previousCamera || !this.viewCamera) return;
    if (
      !(previousCamera instanceof THREE.PerspectiveCamera) ||
      !(this.viewCamera instanceof THREE.OrthographicCamera)
    ) {
      return;
    }
    const target = targetOverride ?? this.controls?.target ?? this.getCameraLookAtFromOptions();
    const distance = this.viewCamera.position.distanceTo(target);
    if (!Number.isFinite(distance) || distance <= 1e-9) return;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(previousCamera.fov) / 2) * distance;
    if (!Number.isFinite(halfHeight) || halfHeight <= 0) return;
    const aspect = root.clientHeight > 0 ? root.clientWidth / root.clientHeight : 1;
    this.viewCamera.top = halfHeight;
    this.viewCamera.bottom = -halfHeight;
    this.viewCamera.left = -halfHeight * aspect;
    this.viewCamera.right = halfHeight * aspect;
    this.viewCamera.updateProjectionMatrix();
  }

  private applyOrbitControlState(): void {
    if (!this.controls) return;
    const cameraOptions = this.getEffectiveCameraOptions();
    const zoomEnabled = cameraOptions.enableZoom ?? true;
    const panEnabled = cameraOptions.enablePan ?? true;
    const rotateEnabled = cameraOptions.enableRotate ?? true;
    this.controls.enabled = zoomEnabled || panEnabled || rotateEnabled;
    this.controls.enableZoom = zoomEnabled;
    this.controls.enablePan = panEnabled;
    this.controls.enableRotate = rotateEnabled;
  }

  private getCameraPositionFromOptions(): THREE.Vector3 {
    const options = this.getEffectiveCameraOptions();
    const x = Number(options.position?.x);
    const y = Number(options.position?.y);
    const z = Number(options.position?.z);
    return new THREE.Vector3(
      Number.isFinite(x) ? x : 120,
      Number.isFinite(y) ? y : 120,
      Number.isFinite(z) ? z : -80,
    );
  }

  private getCameraLookAtFromOptions(): THREE.Vector3 {
    const options = this.getEffectiveCameraOptions();
    const x = Number(options.lookAt?.x);
    const y = Number(options.lookAt?.y);
    const z = Number(options.lookAt?.z);
    return new THREE.Vector3(
      Number.isFinite(x) ? x : 0,
      Number.isFinite(y) ? y : 0,
      Number.isFinite(z) ? z : 0,
    );
  }

  private resolveCameraVector(
    value: { x?: number; y?: number; z?: number } | undefined,
    fallback: THREE.Vector3,
  ): THREE.Vector3 {
    const x = Number(value?.x);
    const y = Number(value?.y);
    const z = Number(value?.z);
    return new THREE.Vector3(
      Number.isFinite(x) ? x : fallback.x,
      Number.isFinite(y) ? y : fallback.y,
      Number.isFinite(z) ? z : fallback.z,
    );
  }

  private captureCurrentCameraZoom(): number {
    if (!this.viewCamera) return 1;
    return Number.isFinite(this.viewCamera.zoom) && this.viewCamera.zoom > 0
      ? this.viewCamera.zoom
      : 1;
  }

  private applyCameraZoom(zoom: number | undefined): void {
    if (!this.viewCamera) return;
    const nextZoom = Number(zoom);
    if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;
    this.viewCamera.zoom = nextZoom;
    this.viewCamera.updateProjectionMatrix();
  }

  private getEffectiveCameraOptions(): CameraRenderOptions {
    const base = defaultCameraOptions();
    return {
      ...base,
      projection: isCameraProjection(this.projection) ? this.projection : base.projection,
      enableZoom: this.enableZoom ?? base.enableZoom,
      enablePan: this.enablePan ?? base.enablePan,
      enableRotate: this.enableRotate ?? base.enableRotate,
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'scax-wc': ScaxWc;
  }
}

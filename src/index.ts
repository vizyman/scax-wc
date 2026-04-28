import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SCAXEngineProps } from './scax-engine';
import SCAXEngine from './scax-engine/scax-engine';

const TAG = '[scax-wc]';

type LensRenderConfig = NonNullable<SCAXEngineProps['lens']>[number] & {
  diameter?: number;
  type?: 'lens' | 'cross-cylinder';
};

type ScaxRenderConfig = Omit<SCAXEngineProps, 'lens'> & {
  lens?: LensRenderConfig[];
};

type CameraProjection = 'perspective' | 'orthogonal';

type CameraRenderOptions = {
  projection?: CameraProjection;
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
  };
}

export function mergeCameraOptions(
  partial: Partial<CameraRenderOptions> | null | undefined,
): CameraRenderOptions {
  const base = defaultCameraOptions();
  if (!partial) return base;
  return {
    projection: isCameraProjection(partial.projection) ? partial.projection : base.projection,
  };
}

export function parseCameraAttribute(raw: string | null): CameraRenderOptions {
  if (raw == null || raw.trim() === '') {
    return defaultCameraOptions();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`${TAG} "camera" must be a JSON object. Got:`, raw);
      return defaultCameraOptions();
    }
    return mergeCameraOptions(parsed as Partial<CameraRenderOptions>);
  } catch {
    console.warn(`${TAG} Failed to parse JSON "camera", using defaults. Raw:`, raw);
    return defaultCameraOptions();
  }
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

type AffinePair = {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
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

const COLOR_CORNEA_PRIMARY = 0x10b981;
const COLOR_CORNEA_SECONDARY = 0xf59e0b;
const COLOR_CORNEA_BASE_PRIMARY = 0x38bdf8;
const COLOR_CORNEA_BASE_SECONDARY = 0xe879f9;
const COLOR_LENS_PRIMARY = 0x14b8a6;
const COLOR_LENS_SECONDARY = 0x8b5cf6;
const COLOR_LENS_CROSS_PLUS_MARKER = 0xef4444;
const COLOR_LENS_CROSS_MINUS_MARKER = 0xffffff;
const COLOR_LENS_CROSS_BISECTOR = 0x000000;
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

function surfaceColor(type: string, name?: string) {
  const lowerName = String(name ?? '').toLowerCase();
  if (lowerName.includes('cornea')) return '#f8fafc';
  if (lowerName.includes('retina') || type === 'spherical-image') return '#fb923c';
  if (type === 'compound') return '#60a5fa';
  if (type === 'toric') return '#c084fc';
  if (type === 'aspherical') return '#22d3ee';
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
    const parts = [surface.front, surface.back].filter((part): part is SurfaceLike =>
      Boolean(part),
    );
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
  },
): THREE.Object3D[] {
  const meshes: THREE.Object3D[] = [];
  const consumed = new Set<number>();
  const findPairIndex = (targetName: string) =>
    surfaces.findIndex((surface, index) =>
      !consumed.has(index) && String(surface?.name ?? '').toLowerCase() === targetName,
    );

  for (let index = 0; index < surfaces.length; index += 1) {
    if (consumed.has(index)) continue;
    const surface = surfaces[index];
    const type = String(surface.type ?? 'surface');
    const name = String(surface.name ?? `${type}-${index}`);
    const color = surfaceColor(type, name);
    const lowerName = name.toLowerCase();
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
            opacity: 0.5,
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

    const buffers = buildGeometryForSurface(
      surface,
      baseRadius,
    );

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
        opacity: 0.5,
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
  const uniqueOrigins = new Map<string, THREE.Vector3>();
  for (const ray of sourceRays) {
    const origin = getRayPoints(ray)[0];
    if (!isFiniteVector3(origin)) continue;
    const key = `${origin.x.toFixed(6)}|${origin.y.toFixed(6)}|${origin.z.toFixed(6)}`;
    if (!uniqueOrigins.has(key)) uniqueOrigins.set(key, origin.clone());
  }

  return [...uniqueOrigins.values()].map((origin) => {
    const geometry = new THREE.SphereGeometry(0.2, 12, 10);
    const material = new THREE.MeshBasicMaterial({
      color: '#fbbf24',
      transparent: true,
      opacity: 0.95,
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(origin);
    return marker;
  });
}

export function buildSturmObjects(sturmInfo: SturmInfoLike[]): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const corneaDiameterMm = 11.6;

  for (const item of sturmInfo) {
    const itemColor = Number.isFinite(item?.color) ? (item.color as number) : 0x60a5fa;
    const approxCenterPoint = toFinitePoint(item?.approx_center);
    const profiles = [item?.anterior?.profile, item?.posterior?.profile];

    for (const profile of profiles) {
      const center = toFinitePoint(profile?.at);
      const angleDeg = Number(profile?.angleMajorDeg);
      if (!center || !Number.isFinite(angleDeg)) continue;
      if (!item.has_astigmatism) continue;
      objects.push(createOrientedLineObject(center, angleDeg, corneaDiameterMm, itemColor));
    }

    if (approxCenterPoint) {
      const markerGeometry = new THREE.SphereGeometry(0.7, 16, 12);
      const markerMaterial = new THREE.MeshStandardMaterial({
        color: itemColor,
        emissive: itemColor,
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

@customElement('scax-wc')
export class ScaxWc extends LitElement {
  private static readonly CAMERA_BASE_POSITION = new THREE.Vector3(29, 13, -38);
  private static readonly CAMERA_TARGET = new THREE.Vector3(0, 0, 2);

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      aspect-ratio: 16 / 9;
      border: 1px solid #d1d5db;
      border-radius: 12px;
      overflow: hidden;
      background: #111827;
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
    attribute: 'camera',
    type: String,
    converter: {
      fromAttribute(value: string | null): CameraRenderOptions {
        return parseCameraAttribute(value);
      },
      toAttribute(value: CameraRenderOptions): string {
        return JSON.stringify(value);
      },
    },
  })
  camera: CameraRenderOptions = mergeCameraOptions({});

  @property({ attribute: 'orbit-control-enabled', type: Boolean })
  orbitControlEnabled = true;

  private scene?: THREE.Scene;
  private viewCamera?: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
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
    return html`
      <div id="canvas-root">
      </div>
    `;
  }

  firstUpdated(): void {
    const root = this.renderRoot.querySelector('#canvas-root') as HTMLDivElement | null;
    if (!root) return;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f172a');

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(root.clientWidth, root.clientHeight);
    root.append(this.renderer.domElement);
    this.initializeCameraAndControls(root);

    const light = new THREE.DirectionalLight('#ffffff', 0.8);
    light.position.set(80, -60, 100);
    this.scene.add(light);

    const ambient = new THREE.AmbientLight('#ffffff', 0.7);
    this.scene.add(ambient);
    this.engine = new SCAXEngine(this.config);
    this.simulateAndRebuild();

    window.addEventListener('resize', this.handleResize);
    this.renderLoop();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('camera')) {
      this.rebuildCameraFromOptions();
    }
    if (changed.has('orbitControlEnabled')) {
      this.applyOrbitControlState();
    }
    if (!changed.has('config')) return;
    if (!this.scene) return;

    if (!this.engine) {
      this.engine = new SCAXEngine(this.config);
    } else {
      this.engine.update(this.config);
    }

    this.simulateAndRebuild();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    window.removeEventListener('resize', this.handleResize);

    this.clearSceneObjects(this.surfaceMeshes);
    this.clearSceneObjects(this.rayObjects);
    this.clearSceneObjects(this.lightSourceObjects);
    this.clearSceneObjects(this.sturmObjects);
    this.clearSceneObjects(this.meridianObjects);
    this.controls?.dispose();
    this.renderer?.dispose();
  }

  private renderLoop = () => {
    if (!this.scene || !this.viewCamera || !this.renderer) return;
    this.controls?.update();
    this.renderer.render(this.scene, this.viewCamera);
    this.animationId = requestAnimationFrame(this.renderLoop);
  };

  /**
   * config 반영 후 simulate를 실행하고 surface mesh를 다시 만든다.
   */
  private simulateAndRebuild() {
    if (!this.engine) return;
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
    this.lastAffineResult = this.calculateAffineResult(tracedRays);
    const state = this.engine as unknown as EngineStateLike;
    const sourceRays = state.light_source?.emitRays?.() ?? [];
    this.rebuildSceneMeshes(tracedRays, sourceRays, sturmInfo);
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

  private rebuildSceneMeshes(
    tracedRays: unknown[],
    sourceRays: unknown[],
    sturmInfo: SturmInfoLike[],
  ) {
    if (!this.scene || !this.engine) return;

    this.clearSceneObjects(this.surfaceMeshes);
    this.clearSceneObjects(this.rayObjects);
    this.clearSceneObjects(this.lightSourceObjects);
    this.clearSceneObjects(this.sturmObjects);
    this.clearSceneObjects(this.meridianObjects);

    const state = this.engine as unknown as EngineStateLike;
    const lensSurfaces = Array.isArray(state.lens) ? state.lens : [];
    const eyeSurfaces = Array.isArray(state.surfaces) ? state.surfaces : [];
    const ordered = [...lensSurfaces, ...eyeSurfaces]
      .filter((surface) => {
        const lowerName = String(surface?.name ?? '').toLowerCase();
        return lowerName !== 'pupil_stop';
      })
      .sort((a, b) => readSurfacePosition(a).z - readSurfacePosition(b).z);
    const corneaSurface = eyeSurfaces.find(
      (surface) => String(surface?.name ?? '').toLowerCase() === 'eye_st',
    );
    const corneaAstigSurface =
      String(corneaSurface?.type ?? '').toLowerCase() === 'compound'
        ? (corneaSurface?.front ?? corneaSurface?.back ?? corneaSurface)
        : corneaSurface;
    const baseCorneaAxis = Number(corneaAstigSurface?.ax ?? 0);
    const firstAstigmaticSturm = sturmInfo.find((item) => Boolean(item?.has_astigmatism));
    const inducedAxisFromSturm = Number(
      firstAstigmaticSturm?.anterior?.profile?.angleMajorDeg ??
        firstAstigmaticSturm?.posterior?.profile?.angleMajorDeg,
    );
    const hasInsertedLens = lensSurfaces.length > 0;
    const hasInducedAstigmatism = hasInsertedLens && Number.isFinite(inducedAxisFromSturm);
    const activeCorneaAxis = hasInducedAstigmatism
      ? normalizeAxis180(inducedAxisFromSturm + 90)
      : normalizeAxis180(baseCorneaAxis);

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
    });
    for (const mesh of this.surfaceMeshes) {
      this.scene.add(mesh);
    }
    if (!this.hasInitialCameraFit) {
      this.fitCameraToObjects(this.surfaceMeshes);
      this.hasInitialCameraFit = true;
    }

    this.rayObjects = buildRayObjects(tracedRays);
    for (const object of this.rayObjects) {
      this.scene.add(object);
    }

    this.lightSourceObjects = buildLightSourceObjects(sourceRays);
    for (const object of this.lightSourceObjects) {
      this.scene.add(object);
    }

    this.sturmObjects = this.buildSturmObjectsWithCorneaAxis(sturmInfo, activeCorneaAxis);
    for (const object of this.sturmObjects) {
      this.scene.add(object);
    }

    const meridianObjects: THREE.Object3D[] = [];
    for (let lensIndex = 0; lensIndex < lensSurfaces.length; lensIndex += 1) {
      const surface = lensSurfaces[lensIndex];
      if (!surface) continue;
      const lensConfig = configLenses[lensIndex] ?? null;
      const lensType = String(lensConfig?.type ?? 'lens').toLowerCase();
      const parts =
        String(surface.type ?? '').toLowerCase() === 'compound'
          ? [surface.front].filter((part): part is SurfaceLike => Boolean(part))
          : [surface];
      for (const part of parts) {
        const axisDeg = Number(part.ax ?? surface.ax ?? 0);
        const halfLength = Math.max(2.5, estimateSurfaceRadius(part) * 0.9);
        const weakMeridianPower = Number(lensConfig?.s ?? 0);
        const strongMeridianPower = weakMeridianPower + Number(lensConfig?.c ?? 0);
        const plusAxis = weakMeridianPower >= strongMeridianPower ? axisDeg : axisDeg + 90;
        const minusAxis = weakMeridianPower < strongMeridianPower ? axisDeg : axisDeg + 90;

        if (lensType === 'cross-cylinder') {
          const plusLine = this.createMeridianLine(
            part,
            plusAxis,
            halfLength,
            COLOR_LENS_PRIMARY,
            LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
          );
          const minusLine = this.createMeridianLine(
            part,
            minusAxis,
            halfLength,
            COLOR_LENS_SECONDARY,
            LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
          );
          const bisectorA = this.createMeridianLine(
            part,
            plusAxis + 45,
            halfLength,
            COLOR_LENS_CROSS_BISECTOR,
            LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
          );
          const bisectorB = this.createMeridianLine(
            part,
            plusAxis + 135,
            halfLength,
            COLOR_LENS_CROSS_BISECTOR,
            LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
          );
          if (plusLine) meridianObjects.push(plusLine);
          if (minusLine) meridianObjects.push(minusLine);
          if (bisectorA) meridianObjects.push(bisectorA);
          if (bisectorB) meridianObjects.push(bisectorB);
          meridianObjects.push(
            ...this.createMeridianEndpointMarkers(
              part,
              plusAxis,
              halfLength,
              COLOR_LENS_CROSS_PLUS_MARKER,
              LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
            ),
          );
          meridianObjects.push(
            ...this.createMeridianEndpointMarkers(
              part,
              minusAxis,
              halfLength,
              COLOR_LENS_CROSS_MINUS_MARKER,
              LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
            ),
          );
          continue;
        }

        const major = this.createMeridianLine(
          part,
          axisDeg,
          halfLength,
          COLOR_LENS_PRIMARY,
          LENS_MERIDIAN_ANTERIOR_OFFSET_MM,
        );
        const minor = this.createMeridianLine(
          part,
          axisDeg + 90,
          halfLength,
          COLOR_LENS_SECONDARY,
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
        activeCorneaAxis,
        halfLength,
        COLOR_CORNEA_PRIMARY,
        CORNEA_MERIDIAN_ANTERIOR_OFFSET_MM,
      );
      const activeMinor = this.createMeridianLine(
        corneaAstigSurface,
        activeCorneaAxis + 90,
        halfLength,
        COLOR_CORNEA_SECONDARY,
        CORNEA_MERIDIAN_ANTERIOR_OFFSET_MM,
      );
      if (activeMajor) meridianObjects.push(activeMajor);
      if (activeMinor) meridianObjects.push(activeMinor);

      if (hasInducedAstigmatism) {
        const baseMajor = this.createMeridianLine(
          corneaAstigSurface,
          baseCorneaAxis,
          halfLength,
          COLOR_CORNEA_BASE_PRIMARY,
          CORNEA_MERIDIAN_ANTERIOR_OFFSET_MM,
        );
        const baseMinor = this.createMeridianLine(
          corneaAstigSurface,
          baseCorneaAxis + 90,
          halfLength,
          COLOR_CORNEA_BASE_SECONDARY,
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
  }

  private calculateAffineResult(tracedRays: unknown[]): AffineResultLike | null {
    if (!this.engine) return null;
    const affinePairs: AffinePair[] = tracedRays
      .map((ray) => {
        const points = getRayPoints(ray);
        if (!Array.isArray(points) || points.length < 2) return null;
        const src = points[0];
        const dst = points[points.length - 1];
        if (!src || !dst) return null;
        const sx = Number(src.x);
        const sy = Number(src.y);
        const tx = Number(dst.x);
        const ty = Number(dst.y);
        if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(tx) || !Number.isFinite(ty))
          return null;
        return { sx, sy, tx, ty };
      })
      .filter((pair): pair is AffinePair => pair !== null);

    return (
      (
        this.engine as unknown as {
          estimateAffineDistortion?: (pairs: AffinePair[]) => AffineResultLike | null;
        }
      ).estimateAffineDistortion?.(affinePairs) ?? null
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

  private estimateSurfaceNormal(
    surface: SurfaceLike,
    x: number,
    y: number,
  ): THREE.Vector3 | null {
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

  private buildSturmObjectsWithCorneaAxis(
    sturmInfo: SturmInfoLike[],
    corneaMeridianAxisDeg: number,
  ): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];
    const corneaDiameterMm = 11.6;
    const focalForPrimary = normalizeAxis180(corneaMeridianAxisDeg + 90);
    const focalForSecondary = normalizeAxis180(corneaMeridianAxisDeg);

    for (const item of sturmInfo) {
      const approxCenterPoint = toFinitePoint(item?.approx_center);
      const profiles = [item?.anterior?.profile, item?.posterior?.profile];

      for (const profile of profiles) {
        const center = toFinitePoint(profile?.at);
        const angleDeg = Number(profile?.angleMajorDeg);
        if (!center || !Number.isFinite(angleDeg)) continue;
        if (!item.has_astigmatism) continue;

        const dPrimary = angleDistance180(angleDeg, focalForPrimary);
        const dSecondary = angleDistance180(angleDeg, focalForSecondary);
        const color = dPrimary <= dSecondary ? COLOR_CORNEA_PRIMARY : COLOR_CORNEA_SECONDARY;
        objects.push(createOrientedLineObject(center, angleDeg, corneaDiameterMm, color));
      }

      if (approxCenterPoint) {
        const markerGeometry = new THREE.SphereGeometry(0.7, 16, 12);
        const markerMaterial = new THREE.MeshStandardMaterial({
          color: Number.isFinite(item?.color) ? (item.color as number) : 0x60a5fa,
          emissive: Number.isFinite(item?.color) ? (item.color as number) : 0x60a5fa,
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

  private handleResize = () => {
    const root = this.renderRoot.querySelector('#canvas-root') as HTMLDivElement | null;
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

  private initializeCameraAndControls(root: HTMLDivElement): void {
    if (!this.renderer) {
      this.viewCamera = this.createCamera(root);
      this.applyCameraPose();
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
    this.applyCameraPose();
    this.controls.update();
  }

  private createCamera(root: HTMLDivElement): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    const aspect = root.clientWidth / root.clientHeight;
    const projection = this.camera.projection ?? 'perspective';
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
    return new THREE.PerspectiveCamera(55, aspect, 0.1, 2000);
  }

  private applyCameraPose(): void {
    if (!this.viewCamera) return;
    const target = ScaxWc.CAMERA_TARGET.clone();
    const position = ScaxWc.CAMERA_BASE_POSITION.clone();
    this.viewCamera.position.copy(position);
    this.viewCamera.up.set(0, 1, 0);
    this.viewCamera.lookAt(target);
    this.viewCamera.updateProjectionMatrix();
    this.controls?.target.copy(target);
  }

  private rebuildCameraFromOptions(): void {
    const root = this.renderRoot.querySelector('#canvas-root') as HTMLDivElement | null;
    if (!root) return;
    this.initializeCameraAndControls(root);
  }

  private applyOrbitControlState(): void {
    if (!this.controls) return;
    const enabled = this.orbitControlEnabled;
    this.controls.enabled = enabled;
    this.controls.enableZoom = enabled;
    this.controls.enablePan = enabled;
    this.controls.enableRotate = enabled;
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'scax-wc': ScaxWc;
  }
}

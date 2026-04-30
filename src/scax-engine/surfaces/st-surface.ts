import { Vector3 } from "three";
import {
  FraunhoferLine,
  normalizeRefractiveIndexSpec,
  RefractiveIndexSpec,
  resolveRefractiveIndex,
} from "../optics/refractive-index";
import {
  EYE_ST_SURFACE_OFFSET_MM,
  RAY_SURFACE_ESCAPE_MM,
  ST_DEFAULT_THICKNESS_MM,
  ST_POWER_EPS_D,
} from "../parameters/constants";
import Ray from "../ray/ray";
import SphericalSurface, { SphericalSurfaceProps } from "./spherical-surface";
import Surface from "./surface";
import ToricSurface, { ToricSurfaceProps } from "./toric-surface";
export type STSurfaceProps = {
  type: "compound";
  name: string;
  position: { x: number, y: number, z: number };
  tilt: { x: number, y: number };
  r?: number;
  s: number;
  c: number;
  ax: number;
  n_before: RefractiveIndexSpec;
  n: RefractiveIndexSpec;
  n_after: RefractiveIndexSpec;
  referencePoint?: { x: number, y: number, z: number };
  thickness?: number;
}

export default class STSurface extends Surface {
  private static readonly POWER_EPS_D = ST_POWER_EPS_D;
  private s: number = 0;
  private c: number = 0;
  private ax: number = 0;
  private n_before: RefractiveIndexSpec = 1.0;
  private n: RefractiveIndexSpec = 1.0;
  private n_after: RefractiveIndexSpec = 1.0;
  private thickness: number = 0;
  /** 구면. vertex z = position.z + thickness (+z 쪽, 광이 나가는 쪽). */
  private sphericalSurface: SphericalSurface;
  /** 토릭(원통). vertex z = position.z (−z 쪽, +z 진행 시 광이 먼저 맞는 쪽). 없으면 null. */
  private toricSurface: ToricSurface | null;
  private sphericalRadiusMm: number = Number.POSITIVE_INFINITY;
  private toricRadiusPerpMm: number = Number.POSITIVE_INFINITY;

  constructor(props: STSurfaceProps) {
    super({ type: "compound", name: props.name, position: props.position, tilt: props.tilt });
    const {
      s,
      c,
      ax,
      n_before = 1.0,
      n = 1.0,
      n_after = n_before,
      referencePoint,
      thickness = ST_DEFAULT_THICKNESS_MM,
    } = props;

    this.s = s;
    this.c = c;
    this.ax = ax;
    this.n_before = normalizeRefractiveIndexSpec(n_before);
    this.n = normalizeRefractiveIndexSpec(n);
    this.n_after = normalizeRefractiveIndexSpec(n_after);
    const hasToric = Math.abs(this.c) >= ST_POWER_EPS_D;
    // Radius must be computed with the same media pair that each sub-surface actually uses.
    // - toric: n_before -> n
    // - spherical: n -> n_after when toric exists, else n_before -> n
    this.toricRadiusPerpMm = this.radiusFromPower(
      this.c,
      this.refractiveIndexAtD(this.n_before),
      this.refractiveIndexAtD(this.n),
    );
    this.sphericalRadiusMm = this.radiusFromPower(
      this.s,
      hasToric ? this.refractiveIndexAtD(this.n) : this.refractiveIndexAtD(this.n_before),
      hasToric ? this.refractiveIndexAtD(this.n_after) : this.refractiveIndexAtD(this.n),
    );
    const requestedThickness = Math.max(0, thickness);
    this.thickness = requestedThickness === 0
      ? this.optimizeThickness(0)
      : requestedThickness;
    this.position.z = this.optimizeToricVertexZFromReference(this.position.z, referencePoint?.z, this.thickness);

    // 복합면: 작은 z에 토릭, 큰 z에 구면(+z 광축 기준 토릭 → 구면 순).
    this.sphericalSurface = this.buildSphericalSurface();
    this.toricSurface = this.buildToricSurface();
  }

  /**
   * 디옵터(D)로부터 반경(mm)을 계산합니다.
   *
   * power(D) = (n2 - n1) / R(m)
   *   -> R(mm) = 1000 * (n2 - n1) / power(D)
   *
   * 굴절력이 사실상 0이면 평면으로 간주하기 위해 +Infinity를 반환합니다.
   */
  private radiusFromPower(powerD: number, nBefore: number, nAfter: number) {
    if (
      !Number.isFinite(powerD)
      || !Number.isFinite(nBefore)
      || !Number.isFinite(nAfter)
    ) {
      return Number.NaN;
    }
    if (Math.abs(powerD) < ST_POWER_EPS_D) return Number.POSITIVE_INFINITY;
    return (1000 * (nAfter - nBefore)) / powerD;
  }

  private refractiveIndexAtD(spec: RefractiveIndexSpec) {
    return resolveRefractiveIndex(spec, "d");
  }

  /**
   * ST 구면 측: z가 더 큰 꼭지( +z 진행 시 출사 쪽 ).
   */
  private buildSphericalSurface() {
    const sphericalZ = this.position.z + this.thickness;
    const hasToric = Math.abs(this.c) >= ST_POWER_EPS_D;
    const nBefore = hasToric ? this.n : this.n_before;
    const nAfter = hasToric ? this.n_after : this.n;

    const props: SphericalSurfaceProps = {
      type: "spherical",
      name: `${this.name}_spherical`,
      position: { x: this.position.x, y: this.position.y, z: sphericalZ },
      tilt: { x: this.tilt.x, y: this.tilt.y },
      r: this.sphericalRadiusMm,
      n_before: nBefore,
      n_after: nAfter,
    };
    return new SphericalSurface(props);
  }

  /**
   * ST 토릭 측: cylinder가 있을 때만. z가 더 작은 꼭지( +z 진행 시 입사 쪽 ).
   */
  private buildToricSurface() {
    if (Math.abs(this.c) < ST_POWER_EPS_D) return null;

    const props: ToricSurfaceProps = {
      type: "toric",
      name: `${this.name}_toric`,
      position: {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
      },
      tilt: { x: this.tilt.x, y: this.tilt.y },
      r_axis: Number.POSITIVE_INFINITY,
      r_perp: this.toricRadiusPerpMm,
      axis_deg: this.ax,
      n_before: this.n_before,
      n_after: this.n,
    };
    return new ToricSurface(props);
  }

  private applyChromaticIndicesToSubSurfaces(ray: Ray) {
    const line = ray.getFraunhoferLine() as FraunhoferLine;
    const nBefore = resolveRefractiveIndex(this.n_before, line);
    const n = resolveRefractiveIndex(this.n, line);
    const nAfter = resolveRefractiveIndex(this.n_after, line);

    const sphericalState = this.sphericalSurface as unknown as {
      n_before: RefractiveIndexSpec;
      n_after: RefractiveIndexSpec;
    };
    if (this.toricSurface) {
      sphericalState.n_before = n;
      sphericalState.n_after = nAfter;
      const toricState = this.toricSurface as unknown as {
        n_before: RefractiveIndexSpec;
        n_after: RefractiveIndexSpec;
      };
      toricState.n_before = nBefore;
      toricState.n_after = n;
      return;
    }

    sphericalState.n_before = nBefore;
    sphericalState.n_after = n;
  }

  /**
   * 구면/토릭 곡면의 z 교차(토릭이 구면을 관통) 방지를 위해
   * 샘플링 영역에서 필요한 최소 중심두께를 계산합니다.
   */
  private optimizeThickness(requestedThickness: number) {
    if (Math.abs(this.c) < ST_POWER_EPS_D) return requestedThickness;

    const sampleRadius = this.samplingRadiusMm();
    if (!Number.isFinite(sampleRadius) || sampleRadius <= 0) return requestedThickness;

    const samplesPerAxis = 49;
    let requiredThickness = requestedThickness;
    const safetyMargin = Math.max(0.05, 2 * RAY_SURFACE_ESCAPE_MM);

    for (let iy = 0; iy < samplesPerAxis; iy++) {
      const y = -sampleRadius + (2 * sampleRadius * iy) / (samplesPerAxis - 1);
      for (let ix = 0; ix < samplesPerAxis; ix++) {
        const x = -sampleRadius + (2 * sampleRadius * ix) / (samplesPerAxis - 1);
        if ((x * x + y * y) > sampleRadius * sampleRadius) continue;

        const sphericalSag = this.sphericalSagAtXY(x, y);
        const toricSag = this.toricSagAtXY(x, y);
        if (!Number.isFinite(sphericalSag) || !Number.isFinite(toricSag)) continue;

        const localRequired = (sphericalSag - toricSag) + safetyMargin;
        if (localRequired > requiredThickness) requiredThickness = localRequired;
      }
    }

    return Math.max(0, requiredThickness);
  }

  /**
   * 기준점(referencePoint.z)으로부터 토릭 꼭지(z)까지의 최소 간격을 확보합니다.
   * - 기준점과 반대 방향으로 현재 토릭 꼭지가 놓인 쪽(sign)을 유지합니다.
   * - 최소 간격은 "토릭–구면 거리(thickness) + 안전여유"입니다.
   */
  private optimizeToricVertexZFromReference(toricVertexZ: number, referenceZ?: number, thicknessMm: number = this.thickness) {
    if (!Number.isFinite(referenceZ)) return toricVertexZ;
    const safetyMargin = Math.max(0.05, 2 * RAY_SURFACE_ESCAPE_MM);
    const minGap = Math.max(EYE_ST_SURFACE_OFFSET_MM, Math.max(0, thicknessMm) + safetyMargin);
    const delta = toricVertexZ - (referenceZ as number);
    const side = Math.abs(delta) < 1e-12 ? -1 : Math.sign(delta);
    const currentGap = Math.abs(delta);
    if (currentGap >= minGap) return toricVertexZ;
    return (referenceZ as number) + side * minGap;
  }

  private samplingRadiusMm() {
    const defaultRadius = 12;
    const finiteRadii = [this.sphericalRadiusMm, this.toricRadiusPerpMm]
      .filter((r) => Number.isFinite(r) && Math.abs(r) > 1e-6)
      .map((r) => Math.abs(r));
    if (!finiteRadii.length) return defaultRadius;
    return Math.max(1.0, Math.min(defaultRadius, 0.98 * Math.min(...finiteRadii)));
  }

  /**
   * 구면 측 꼭지점 기준 sag(mm)
   */
  private sphericalSagAtXY(x: number, y: number) {
    const rhoSq = x * x + y * y;
    const r = this.sphericalRadiusMm;
    if (!Number.isFinite(r) || Math.abs(r) > 1e12) return 0;

    const rr = r * r;
    if (rhoSq > rr) return Number.NaN;
    const root = Math.sqrt(Math.max(0, rr - rhoSq));
    return r > 0 ? r - root : r + root;
  }

  /**
   * 토릭 측 꼭지점 기준 sag(mm)
   */
  private toricSagAtXY(x: number, y: number) {
    const axisRad = (this.ax * Math.PI) / 180;
    const cAxis = Math.cos(axisRad);
    const sAxis = Math.sin(axisRad);
    const u = cAxis * x + sAxis * y;
    const v = -sAxis * x + cAxis * y;

    const cu = 0; // r_axis = Infinity
    const cv = (!Number.isFinite(this.toricRadiusPerpMm) || Math.abs(this.toricRadiusPerpMm) > 1e12)
      ? 0
      : 1 / this.toricRadiusPerpMm;

    const a = cu * u * u + cv * v * v;
    const b = 1 - cu * cu * u * u - cv * cv * v * v;
    if (b < 0) return Number.NaN;
    const den = 1 + Math.sqrt(Math.max(0, b));
    if (Math.abs(den) < 1e-12) return Number.NaN;
    return a / den;
  }

  private isOpticallyNeutral() {
    return (
      Math.abs(Number(this.s) || 0) < STSurface.POWER_EPS_D
      && Math.abs(Number(this.c) || 0) < STSurface.POWER_EPS_D
    );
  }

  refract(ray: Ray): Ray | null {
    // 무도수 ST면은 기하(면 위치/경사)는 유지하되 굴절력은 0으로 취급하여 직진 통과시킵니다.
    if (this.isOpticallyNeutral()) {
      const direction = ray.getDirection().normalize();
      const passthrough = ray.clone();
      const hitPoint = this.sphericalSurface.incident(ray);
      if (hitPoint) {
        passthrough.appendPoint(hitPoint);
        passthrough.continueFrom(
          hitPoint.clone().addScaledVector(direction, RAY_SURFACE_ESCAPE_MM),
          direction,
        );
      }
      this.refractedRays.push(passthrough.clone());
      return passthrough;
    }
    this.applyChromaticIndicesToSubSurfaces(ray);
    // 원통 성분이 없으면 단일(구면)면으로 처리합니다.
    if (!this.toricSurface) {
      const single = this.sphericalSurface.refract(ray);
      if (!single) return null;
      this.refractedRays.push(single.clone());
      return single;
    }

    // +z 진행: 토릭(작은 z) → 구면(큰 z)
    const afterToric = this.toricSurface.refract(ray);
    if (!afterToric) return null;
    const afterSpherical = this.sphericalSurface.refract(afterToric);
    if (!afterSpherical) return null;
    this.refractedRays.push(afterSpherical.clone());
    return afterSpherical;
  }

  incident(ray: Ray): Vector3 | null {
    // 복합면의 첫 hit: +z 기준 토릭이 앞서므로 toricSurface 우선.
    const primary = this.toricSurface ?? this.sphericalSurface;
    const hitPoint = primary.incident(ray);
    if (!hitPoint) return null;
    this.incidentRays.push(ray.clone());
    return hitPoint;
  }

  public getOptimizedThicknessMm() {
    return this.thickness;
  }
}
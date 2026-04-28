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
  private s: number = 0;
  private c: number = 0;
  private ax: number = 0;
  private n_before: RefractiveIndexSpec = 1.0;
  private n: RefractiveIndexSpec = 1.0;
  private n_after: RefractiveIndexSpec = 1.0;
  private thickness: number = 0;
  private front: SphericalSurface;
  private back: ToricSurface | null;
  private frontRadiusMm: number = Number.POSITIVE_INFINITY;
  private backRadiusPerpMm: number = Number.POSITIVE_INFINITY;

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
    this.frontRadiusMm = this.radiusFromPower(this.s, this.refractiveIndexAtD(this.n_before), this.refractiveIndexAtD(this.n));
    this.backRadiusPerpMm = this.radiusFromPower(this.c, this.refractiveIndexAtD(this.n), this.refractiveIndexAtD(this.n_after));
    const requestedThickness = Math.max(0, thickness);
    this.thickness = requestedThickness === 0
      ? this.optimizeThickness(0)
      : requestedThickness;
    this.position.z = this.optimizeBackZFromReference(this.position.z, referencePoint?.z, this.thickness);

    // 복합면은 "전면 구면 + 후면 토릭"으로 구성됩니다.
    this.front = this.buildFrontSurface();
    this.back = this.buildBackSurface();
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
   * ST 전면: 구면(sphere) 성분
   */
  private buildFrontSurface() {
    const frontZ = this.position.z + this.thickness;
    const hasBack = Math.abs(this.c) >= ST_POWER_EPS_D;
    const frontNBefore = hasBack ? this.n : this.n_before;
    const frontNAfter = hasBack ? this.n_after : this.n;

    const frontProps: SphericalSurfaceProps = {
      type: "spherical",
      name: `${this.name}_front`,
      position: { x: this.position.x, y: this.position.y, z: frontZ },
      tilt: { x: this.tilt.x, y: this.tilt.y },
      r: this.frontRadiusMm,
      n_before: frontNBefore,
      n_after: frontNAfter,
    };
    return new SphericalSurface(frontProps);
  }

  /**
   * ST 후면: cylinder 성분이 존재할 때만 토릭면을 생성합니다.
   * cylinder가 0에 매우 가까우면 후면은 생략됩니다.
   */
  private buildBackSurface() {
    if (Math.abs(this.c) < ST_POWER_EPS_D) return null;

    const backProps: ToricSurfaceProps = {
      type: "toric",
      name: `${this.name}_back`,
      position: {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
      },
      tilt: { x: this.tilt.x, y: this.tilt.y + this.ax },
      r_axis: Number.POSITIVE_INFINITY,
      r_perp: this.backRadiusPerpMm,
      n_before: this.n_before,
      n_after: this.n,
    };
    return new ToricSurface(backProps);
  }

  private applyChromaticIndicesToSubSurfaces(ray: Ray) {
    const line = ray.getFraunhoferLine() as FraunhoferLine;
    const nBefore = resolveRefractiveIndex(this.n_before, line);
    const n = resolveRefractiveIndex(this.n, line);
    const nAfter = resolveRefractiveIndex(this.n_after, line);

    const frontState = this.front as unknown as {
      n_before: RefractiveIndexSpec;
      n_after: RefractiveIndexSpec;
    };
    if (this.back) {
      frontState.n_before = n;
      frontState.n_after = nAfter;
      const backState = this.back as unknown as {
        n_before: RefractiveIndexSpec;
        n_after: RefractiveIndexSpec;
      };
      backState.n_before = nBefore;
      backState.n_after = n;
      return;
    }

    frontState.n_before = nBefore;
    frontState.n_after = n;
  }

  /**
   * 전면/후면 곡면의 z 교차(후면이 전면을 관통) 방지를 위해
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

        const frontSag = this.frontSagAtXY(x, y);
        const backSag = this.backSagAtXY(x, y);
        if (!Number.isFinite(frontSag) || !Number.isFinite(backSag)) continue;

        const localRequired = (frontSag - backSag) + safetyMargin;
        if (localRequired > requiredThickness) requiredThickness = localRequired;
      }
    }

    return Math.max(0, requiredThickness);
  }

  /**
   * 기준점(referencePoint.z)으로부터 후면(back vertex)까지의 최소 간격을 확보합니다.
   * - 기준점과 반대 방향으로 현재 후면이 놓인 쪽(sign)을 유지합니다.
   * - 최소 간격은 "후면-전면 거리(thickness) + 안전여유"입니다.
   */
  private optimizeBackZFromReference(backZ: number, referenceZ?: number, thicknessMm: number = this.thickness) {
    if (!Number.isFinite(referenceZ)) return backZ;
    const safetyMargin = Math.max(0.05, 2 * RAY_SURFACE_ESCAPE_MM);
    const minGap = Math.max(EYE_ST_SURFACE_OFFSET_MM, Math.max(0, thicknessMm) + safetyMargin);
    const delta = backZ - (referenceZ as number);
    const side = Math.abs(delta) < 1e-12 ? -1 : Math.sign(delta);
    const currentGap = Math.abs(delta);
    if (currentGap >= minGap) return backZ;
    return (referenceZ as number) + side * minGap;
  }

  private samplingRadiusMm() {
    const defaultRadius = 12;
    const finiteRadii = [this.frontRadiusMm, this.backRadiusPerpMm]
      .filter((r) => Number.isFinite(r) && Math.abs(r) > 1e-6)
      .map((r) => Math.abs(r));
    if (!finiteRadii.length) return defaultRadius;
    return Math.max(1.0, Math.min(defaultRadius, 0.98 * Math.min(...finiteRadii)));
  }

  /**
   * 구면 전면의 꼭지점 기준 sag(mm)
   */
  private frontSagAtXY(x: number, y: number) {
    const rhoSq = x * x + y * y;
    const r = this.frontRadiusMm;
    if (!Number.isFinite(r) || Math.abs(r) > 1e12) return 0;

    const rr = r * r;
    if (rhoSq > rr) return Number.NaN;
    const root = Math.sqrt(Math.max(0, rr - rhoSq));
    return r > 0 ? r - root : r + root;
  }

  /**
   * 토릭 후면의 꼭지점 기준 sag(mm)
   */
  private backSagAtXY(x: number, y: number) {
    const axisRad = (this.tilt.y + this.ax) * Math.PI / 180;
    const cAxis = Math.cos(axisRad);
    const sAxis = Math.sin(axisRad);
    const u = cAxis * x + sAxis * y;
    const v = -sAxis * x + cAxis * y;

    const cu = 0; // r_axis = Infinity
    const cv = (!Number.isFinite(this.backRadiusPerpMm) || Math.abs(this.backRadiusPerpMm) > 1e12)
      ? 0
      : 1 / this.backRadiusPerpMm;

    const a = cu * u * u + cv * v * v;
    const b = 1 - cu * cu * u * u - cv * cv * v * v;
    if (b < 0) return Number.NaN;
    const den = 1 + Math.sqrt(Math.max(0, b));
    if (Math.abs(den) < 1e-12) return Number.NaN;
    return a / den;
  }

  refract(ray: Ray): Ray | null {
    this.applyChromaticIndicesToSubSurfaces(ray);
    // 원통 성분이 없으면 단일(구면)면으로 처리합니다.
    if (!this.back) {
      const single = this.front.refract(ray);
      if (!single) return null;
      this.refractedRays.push(single.clone());
      return single;
    }

    // 후면 기준 배치: 후면(토릭) -> 전면(구면)
    const afterBack = this.back.refract(ray);
    if (!afterBack) return null;
    const afterFront = this.front.refract(afterBack);
    if (!afterFront) return null;
    this.refractedRays.push(afterFront.clone());
    return afterFront;
  }

  incident(ray: Ray): Vector3 | null {
    // 복합면의 첫 hit는 항상 후면 기준(토릭 우선)으로 결정됩니다.
    const primary = this.back ?? this.front;
    const hitPoint = primary.incident(ray);
    if (!hitPoint) return null;
    this.incidentRays.push(ray.clone());
    return hitPoint;
  }

  public getOptimizedThicknessMm() {
    return this.thickness;
  }
}
import { Euler, Quaternion, Vector3 } from "three";
import {
  FraunhoferLine,
  normalizeRefractiveIndexSpec,
  RefractiveIndexSpec,
  resolveRefractiveIndex,
} from "../optics/refractive-index";
import {
  EPSILON,
  RAY_SURFACE_ESCAPE_MM,
  TORIC_COINCIDENT_SURFACE_TOL_MM,
  TORIC_MAX_ITERS,
  TORIC_MIN_T_MM,
  TORIC_ON_SURFACE_TOL_MM,
} from "../parameters/constants";
import Ray from "../ray/ray";
import Surface from "./surface";

export type ToricSurfaceProps = {
  type: "toric";
  name: string;
  position: { x: number, y: number, z: number };
  tilt: { x: number, y: number };
  r_axis: number;
  r_perp: number;
  axis_deg?: number;
  n_before: RefractiveIndexSpec;
  n_after: RefractiveIndexSpec;
}
export default class ToricSurface extends Surface {
  private r_axis: number = 0;
  private r_perp: number = 0;
  private n_before: RefractiveIndexSpec = 1.0;
  private n_after: RefractiveIndexSpec = 1.0;
  private axisDeg: number = 0;

  constructor(props: ToricSurfaceProps) {
    super({ type: "toric", name: props.name, position: props.position, tilt: props.tilt });
    const { r_axis, r_perp, axis_deg = 0, n_before = 1.0, n_after = 1.0 } = props;
    this.r_axis = r_axis;
    this.r_perp = r_perp;
    this.axisDeg = axis_deg;
    this.n_before = normalizeRefractiveIndexSpec(n_before);
    this.n_after = normalizeRefractiveIndexSpec(n_after);
  }

  private refractiveIndicesForRay(ray: Ray) {
    const line = ray.getFraunhoferLine() as FraunhoferLine;
    return {
      nBefore: resolveRefractiveIndex(this.n_before, line),
      nAfter: resolveRefractiveIndex(this.n_after, line),
    };
  }

  /**
   * Toric 면의 축(meridian) 회전을 위해 사용하는 삼각함수 값입니다.
   * 축(axis) 회전은 axisDeg(도 단위)를 사용합니다.
   */
  private axisTrig() {
    const rad = (this.axisDeg * Math.PI) / 180;
    return { c: Math.cos(rad), s: Math.sin(rad) };
  }

  private worldQuaternion() {
    const tiltXRad = (this.tilt.x * Math.PI) / 180;
    const tiltYRad = (this.tilt.y * Math.PI) / 180;
    return new Quaternion().setFromEuler(new Euler(tiltXRad, tiltYRad, 0, "XYZ"));
  }

  private worldPointToLocal(worldPoint: Vector3) {
    const inverse = this.worldQuaternion().invert();
    return worldPoint.clone().sub(this.position).applyQuaternion(inverse);
  }

  private localPointToWorld(localPoint: Vector3) {
    return localPoint.clone().applyQuaternion(this.worldQuaternion()).add(this.position);
  }

  private worldDirToLocal(worldDirection: Vector3) {
    const inverse = this.worldQuaternion().invert();
    return worldDirection.clone().applyQuaternion(inverse).normalize();
  }

  private localDirToWorld(localDirection: Vector3) {
    return localDirection.clone().applyQuaternion(this.worldQuaternion()).normalize();
  }

  /**
   * 월드 좌표계 (x, y)를 토릭 로컬 좌표계 (u, v)로 변환합니다.
   * - u: 축 방향 meridian
   * - v: 축에 수직인 meridian
   */
  private toLocalUV(x: number, y: number) {
    const { c, s } = this.axisTrig();
    return {
      u: c * x + s * y,
      v: -s * x + c * y,
    };
  }

  /**
   * 로컬 좌표계에서 계산한 sag 미분(dz/du, dz/dv)을
   * 월드 좌표계의 기울기(dz/dx, dz/dy)로 다시 매핑합니다.
   */
  private localDerivativesToWorld(dZdu: number, dZdv: number) {
    const { c, s } = this.axisTrig();
    return {
      dzdx: dZdu * c - dZdv * s,
      dzdy: dZdu * s + dZdv * c,
    };
  }

  /**
   * 반경으로부터 곡률(1/R)을 계산합니다.
   * - 반경이 너무 크거나 무한대면 평면으로 간주하여 0 반환
   * - 반경이 0에 너무 가까우면 비정상 값으로 NaN 반환
   */
  private curvature(radius: number) {
    if (!Number.isFinite(radius) || Math.abs(radius) > 1e12) return 0;
    if (Math.abs(radius) < EPSILON) return Number.NaN;
    return 1 / radius;
  }

  /**
   * 주어진 XY에서 토릭면의 기하정보를 계산합니다.
   * - sag: 꼭지점 대비 z 높이
   * - dzdx/dzdy: 면 기울기
   * - normal: 2번째 매질 방향을 만들 때 사용할 기본 법선
   */
  private geometryAtXY(x: number, y: number) {
    const { u, v } = this.toLocalUV(x, y);
    const cu = this.curvature(this.r_axis);
    const cv = this.curvature(this.r_perp);
    if (!Number.isFinite(cu) || !Number.isFinite(cv)) return null;

    // biconic(conic=0) sag 식
    const a = cu * u * u + cv * v * v;
    const b = 1 - cu * cu * u * u - cv * cv * v * v;
    if (b < -1e-6) return null; // 루트 내부가 음수면 정의역 밖
    const sqrtB = Math.sqrt(Math.max(0, b));
    const den = 1 + sqrtB;
    if (Math.abs(den) < EPSILON || Math.abs(sqrtB) < EPSILON) return null;
    const sag = a / den;

    // sag 미분 계산
    const dAdu = 2 * cu * u;
    const dAdv = 2 * cv * v;
    const dSqrtBdu = (-(cu * cu) * u) / sqrtB;
    const dSqrtBdv = (-(cv * cv) * v) / sqrtB;
    const denSq = den * den;
    const dZdu = (dAdu * den - a * dSqrtBdu) / denSq;
    const dZdv = (dAdv * den - a * dSqrtBdv) / denSq;
    const { dzdx, dzdy } = this.localDerivativesToWorld(dZdu, dZdv);
    const normal = new Vector3(-dzdx, -dzdy, 1).normalize();

    return { sag, dzdx, dzdy, normal };
  }

  incident(ray: Ray): Vector3 | null {
    const origin = this.worldPointToLocal(ray.endPoint());
    const direction = this.worldDirToLocal(ray.getDirection().normalize());

    // 시작점이 이미 표면 위라면 재계산 없이 바로 반환합니다.
    const geometryAtOrigin = this.geometryAtXY(origin.x, origin.y);
    if (geometryAtOrigin) {
      const f0 = origin.z - geometryAtOrigin.sag;
      if (Math.abs(f0) <= TORIC_ON_SURFACE_TOL_MM) {
        this.incidentRays.push(ray.clone());
        return origin.clone();
      }

      // 동일 z 근처의 연속 표면에서 앞면이 origin을 약간 밀어냈을 때를 허용합니다.
      if (
        f0 > 0
        && f0 <= TORIC_COINCIDENT_SURFACE_TOL_MM
        && direction.z > 0
        && 0 <= origin.z + TORIC_COINCIDENT_SURFACE_TOL_MM
      ) {
        this.incidentRays.push(ray.clone());
        return origin.clone();
      }
    }

    // z-plane 기준 초기 seed 이후 뉴턴법으로 교점 t를 수렴시킵니다.
    let t = Math.max(TORIC_MIN_T_MM, -origin.z);

    for (let i = 0; i < TORIC_MAX_ITERS; i++) {
      const p = origin.clone().addScaledVector(direction, t);
      const geometry = this.geometryAtXY(p.x, p.y);
      if (!geometry) return null;

      const f = p.z - geometry.sag;
      const df = direction.z - geometry.dzdx * direction.x - geometry.dzdy * direction.y;
      if (!Number.isFinite(df) || Math.abs(df) < EPSILON) return null;

      const dt = f / df;
      t -= dt;
      if (!Number.isFinite(t) || t < TORIC_MIN_T_MM) return null;

      if (Math.abs(dt) < 1e-8) {
        const hitPoint = this.localPointToWorld(origin.clone().addScaledVector(direction, t));
        this.incidentRays.push(ray.clone());
        return hitPoint;
      }
    }

    return null;
  }

  refract(ray: Ray): Ray | null {
    const hitPoint = this.incident(ray);
    if (!hitPoint) return null;

    const geometry = this.geometryAtXY(hitPoint.x, hitPoint.y);
    if (!geometry) return null;

    // 스넬 굴절 벡터 계산
    const incidentDir = this.worldDirToLocal(ray.getDirection().normalize());
    const normalIntoSecond = geometry.normal.clone();

    // 법선을 입사방향과 같은 반공간으로 맞춰 2번째 매질 방향으로 정렬
    if (normalIntoSecond.dot(incidentDir) < 0) {
      normalIntoSecond.multiplyScalar(-1);
    }

    const cos1 = Math.max(-1, Math.min(1, normalIntoSecond.dot(incidentDir)));
    const sin1Sq = Math.max(0, 1 - cos1 * cos1);
    const { nBefore, nAfter } = this.refractiveIndicesForRay(ray);
    const sin2 = (nBefore / nAfter) * Math.sqrt(sin1Sq);

    // 전반사(TIR)
    if (sin2 > 1 + 1e-10) return null;

    const cos2 = Math.sqrt(Math.max(0, 1 - sin2 * sin2));
    const tangent = incidentDir.clone().sub(normalIntoSecond.clone().multiplyScalar(cos1));
    const outDirectionLocal = tangent.lengthSq() < 1e-12
      ? incidentDir.clone()
      : normalIntoSecond
        .clone()
        .multiplyScalar(cos2)
        .add(tangent.normalize().multiplyScalar(sin2))
        .normalize();
    const outDirection = this.localDirToWorld(outDirectionLocal);

    const refractedRay = ray.clone();
    refractedRay.appendPoint(hitPoint);
    refractedRay.continueFrom(
      hitPoint.clone().addScaledVector(outDirection, RAY_SURFACE_ESCAPE_MM),
      outDirection,
    );

    this.refractedRays.push(refractedRay.clone());
    return refractedRay;
  }


}

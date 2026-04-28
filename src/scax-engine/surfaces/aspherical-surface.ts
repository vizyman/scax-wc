import { Vector3 } from "three";
import {
  FraunhoferLine,
  normalizeRefractiveIndexSpec,
  RefractiveIndexSpec,
  resolveRefractiveIndex,
} from "../optics/refractive-index";
import { EPSILON, RAY_SURFACE_ESCAPE_MM } from "../parameters/constants";
import Ray from "../ray/ray";
import Surface from "./surface";

export type AsphericalSurfaceProps = {
  type: "aspherical";
  name: string;
  position: { x: number, y: number, z: number };
  tilt: { x: number, y: number };
  r: number;
  conic: number;
  n_before: RefractiveIndexSpec;
  n_after: RefractiveIndexSpec;
}

export default class AsphericalSurface extends Surface {
  /**
   * 수치 계산 상수들
   * - MIN_T: 현재 시작점과의 자기 재교차를 피하기 위한 최소 진행 거리
   * - MAX_ITERS: 뉴턴법 반복 횟수
   * - BISECTION_ITERS: 이분법 반복 횟수
   */
  private static readonly MIN_T = 1e-6;
  private static readonly MAX_ITERS = 24;
  private static readonly BISECTION_ITERS = 36;
  private static readonly BRACKET_SCAN_STEPS = 96;
  private static readonly MAX_BRACKET_T_MM = 80;

  private r: number = 0;
  private conic: number = 0;
  private n_before: RefractiveIndexSpec = 1.0;
  private n_after: RefractiveIndexSpec = 1.0;

  constructor(props: AsphericalSurfaceProps) {
    super({ type: "aspherical", name: props.name, position: props.position, tilt: props.tilt });
    const { r, conic = -1.0, n_before = 1.0, n_after = 1.0 } = props;
    this.r = r;
    this.conic = conic;
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
   * 비구면 사그(sag)와 그 기울기(미분)를 계산합니다.
   *
   * 회전대칭 비구면 식:
   * z = c*rho^2 / (1 + sqrt(1 - (1+k)*c^2*rho^2))
   * - c = 1 / R (곡률)
   * - k = conic constant
   * - rho^2 = x^2 + y^2
   *
   * 반환값:
   * - sag: 꼭지점 기준 z 변위(mm)
   * - dzdx, dzdy: 표면 기울기 (법선 계산과 뉴턴법 미분에 사용)
   */
  private geometryAtXY(x: number, y: number): { sag: number; dzdx: number; dzdy: number; normal: Vector3 } | null {
    if (!Number.isFinite(this.r) || Math.abs(this.r) < EPSILON) return null;

    const curvature = 1 / this.r;
    const rho2 = x * x + y * y;
    const onePlusConic = 1 + this.conic;
    const b = 1 - onePlusConic * curvature * curvature * rho2;

    // 루트 내부가 큰 음수면 이 좌표는 표면 정의역 밖입니다.
    if (b < -1e-3) return null;

    const sqrtB = Math.sqrt(Math.max(0, b));
    const denom = 1 + sqrtB;
    if (Math.abs(denom) < EPSILON || Math.abs(sqrtB) < EPSILON) return null;

    const sag = (curvature * rho2) / denom;

    // d(rho^2)/dx, d(rho^2)/dy
    const dRho2dx = 2 * x;
    const dRho2dy = 2 * y;

    // b = 1 - alpha * rho^2, alpha = (1+k)c^2
    const alpha = onePlusConic * curvature * curvature;
    const dBdx = -alpha * dRho2dx;
    const dBdy = -alpha * dRho2dy;
    const dSqrtBdx = dBdx / (2 * sqrtB);
    const dSqrtBdy = dBdy / (2 * sqrtB);

    // z = N / D, N = c*rho^2, D = 1 + sqrtB
    const n = curvature * rho2;
    const dNdx = curvature * dRho2dx;
    const dNdy = curvature * dRho2dy;
    const dDdx = dSqrtBdx;
    const dDdy = dSqrtBdy;
    const denom2 = denom * denom;

    const dzdx = (dNdx * denom - n * dDdx) / denom2;
    const dzdy = (dNdy * denom - n * dDdy) / denom2;
    const normal = new Vector3(-dzdx, -dzdy, 1).normalize();

    return { sag, dzdx, dzdy, normal };
  }

  /**
   * 광선 파라미터 t에서의 표면 방정식 값 f(t)를 계산합니다.
   * f(t)=0 이면 교점입니다.
   */
  private surfaceEquationAtT(origin: Vector3, direction: Vector3, t: number): number | null {
    if (!Number.isFinite(t) || t < AsphericalSurface.MIN_T) return null;
    const p = origin.clone().addScaledVector(direction, t);
    const geometry = this.geometryAtXY(p.x, p.y);
    if (!geometry) return null;
    return p.z - (this.position.z + geometry.sag);
  }

  /**
   * 뉴턴법이 실패했을 때를 대비해, 일정 구간에서 부호가 바뀌는 브래킷을 찾습니다.
   */
  private scanBracketRange(origin: Vector3, direction: Vector3, tMin: number, tMax: number, samples: number) {
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMax <= tMin) return null;

    const n = Math.max(8, Math.floor(samples));
    let prevT = tMin;
    let prevF = this.surfaceEquationAtT(origin, direction, prevT);

    for (let i = 1; i <= n; i++) {
      const alpha = i / n;
      const t = tMin + (tMax - tMin) * alpha;
      const f = this.surfaceEquationAtT(origin, direction, t);
      if (f == null) continue;
      if (Math.abs(f) < 1e-10) {
        return { a: Math.max(AsphericalSurface.MIN_T, t - 1e-4), b: t + 1e-4 };
      }
      if (prevF != null && prevF * f <= 0) {
        return prevT < t ? { a: prevT, b: t } : { a: t, b: prevT };
      }
      prevT = t;
      prevF = f;
    }

    return null;
  }

  /**
   * 브래킷 [a,b] 내부에서 이분법으로 f(t)=0의 근을 찾습니다.
   */
  private bisectionRoot(origin: Vector3, direction: Vector3, a: number, b: number): number | null {
    let left = Math.max(AsphericalSurface.MIN_T, Math.min(a, b));
    let right = Math.max(AsphericalSurface.MIN_T, Math.max(a, b));
    if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return null;

    let fLeft = this.surfaceEquationAtT(origin, direction, left);
    let fRight = this.surfaceEquationAtT(origin, direction, right);
    if (fLeft == null || fRight == null) return null;
    if (Math.abs(fLeft) < 1e-10) return left;
    if (Math.abs(fRight) < 1e-10) return right;
    if (fLeft * fRight > 0) return null;

    for (let i = 0; i < AsphericalSurface.BISECTION_ITERS; i++) {
      const mid = (left + right) * 0.5;
      const fMid = this.surfaceEquationAtT(origin, direction, mid);
      if (fMid == null) {
        right = mid;
        continue;
      }
      if (Math.abs(fMid) < 1e-10 || Math.abs(right - left) < 1e-8) return mid;
      if (fLeft * fMid <= 0) {
        right = mid;
        fRight = fMid;
      } else {
        left = mid;
        fLeft = fMid;
      }
      if (!Number.isFinite(fRight)) return null;
    }

    return (left + right) * 0.5;
  }

  incident(ray: Ray): Vector3 | null {
    // 현재 광선 끝점/방향을 기준으로 "앞으로 진행하는 첫 교점"을 찾습니다.
    const origin = ray.endPoint();
    const direction = ray.getDirection().normalize();

    // z-plane 기반의 초기 추정치(뉴턴법 seed)
    let t = Math.abs(direction.z) < EPSILON
      ? Number.NaN
      : (this.position.z - origin.z) / direction.z;
    if (!Number.isFinite(t) || t < AsphericalSurface.MIN_T) {
      t = Math.max(AsphericalSurface.MIN_T, this.position.z - origin.z);
    }

    let convergedT: number | null = null;

    // 1) 뉴턴법: 빠른 수렴
    for (let i = 0; i < AsphericalSurface.MAX_ITERS; i++) {
      const p = origin.clone().addScaledVector(direction, t);
      const geometry = this.geometryAtXY(p.x, p.y);
      if (!geometry) break;

      const f = p.z - (this.position.z + geometry.sag);
      const df = direction.z - geometry.dzdx * direction.x - geometry.dzdy * direction.y;
      if (!Number.isFinite(df) || Math.abs(df) < EPSILON) break;

      const dt = f / df;
      t -= dt;

      if (!Number.isFinite(t) || t < AsphericalSurface.MIN_T) break;
      if (Math.abs(dt) < 1e-8) {
        convergedT = t;
        break;
      }
    }

    if (Number.isFinite(convergedT) && (convergedT as number) >= AsphericalSurface.MIN_T) {
      const hitPoint = origin.clone().addScaledVector(direction, convergedT as number);
      this.incidentRays.push(ray.clone());
      return hitPoint;
    }

    // 2) 실패 시 브래킷 + 이분법: 느리지만 안정적
    const bracket = this.scanBracketRange(
      origin,
      direction,
      AsphericalSurface.MIN_T,
      AsphericalSurface.MAX_BRACKET_T_MM,
      AsphericalSurface.BRACKET_SCAN_STEPS,
    );

    if (!bracket) return null;

    const hitT = this.bisectionRoot(origin, direction, bracket.a, bracket.b);
    if (!Number.isFinite(hitT) || (hitT as number) < AsphericalSurface.MIN_T) return null;

    const hitPoint = origin.clone().addScaledVector(direction, hitT as number);
    this.incidentRays.push(ray.clone());
    return hitPoint;
  }

  refract(ray: Ray): Ray | null {
    const hitPoint = this.incident(ray);
    if (!hitPoint) return null;

    const geometry = this.geometryAtXY(hitPoint.x, hitPoint.y);
    if (!geometry) return null;

    // 스넬 굴절 벡터 계산
    const incidentDir = ray.getDirection().normalize();
    const normalIntoSecond = geometry.normal.clone();

    // 법선을 "2번째 매질 쪽" 방향으로 정렬
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
    const outDirection = tangent.lengthSq() < 1e-12
      ? incidentDir.clone()
      : normalIntoSecond
        .clone()
        .multiplyScalar(cos2)
        .add(tangent.normalize().multiplyScalar(sin2))
        .normalize();

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
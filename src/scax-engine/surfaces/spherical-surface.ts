import { Vector3 } from "three";
import {
  EPSILON,
  RAY_SURFACE_ESCAPE_MM,
  TORIC_COINCIDENT_SURFACE_TOL_MM,
  TORIC_ON_SURFACE_TOL_MM,
} from "../parameters/constants";
import {
  FraunhoferLine,
  normalizeRefractiveIndexSpec,
  RefractiveIndexSpec,
  resolveRefractiveIndex,
} from "../optics/refractive-index";
import Ray from "../ray/ray";
import Surface from "./surface";
export type SphericalSurfaceProps = {
  type: "spherical";
  name: string;
  r: number;
  position: { x: number, y: number, z: number };
  tilt: { x: number, y: number };
  n_before: RefractiveIndexSpec;
  n_after: RefractiveIndexSpec;
}
export default class SphericalSurface extends Surface {
  private r: number = 0;
  private n_before: RefractiveIndexSpec = 1.0;
  private n_after: RefractiveIndexSpec = 1.0;

  constructor(props: SphericalSurfaceProps) {
    super({ type: "spherical", name: props.name, position: props.position, tilt: props.tilt });
    const { r, n_before = 1.0, n_after = 1.0 } = props;
    this.r = r;
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
   * 반경이 너무 크거나 비정상 값이면 평면으로 간주합니다.
   * (legacy 코드의 planar fallback 동작을 그대로 반영)
   */
  private isPlanar() {
    return !Number.isFinite(this.r) || Math.abs(this.r) > 1e12;
  }

  /**
   * 구면의 중심점입니다.
   * 이 프로젝트의 구면은 +Z 축을 기준으로 배치되며,
   * 중심은 꼭지점(position)에서 반경만큼 Z 방향으로 이동한 위치입니다.
   */
  private sphereCenter() {
    return new Vector3(this.position.x, this.position.y, this.position.z + this.r);
  }

  /**
   * 굴절 계산에 사용할 "2번째 매질 방향" 법선을 계산합니다.
   * - 평면: +Z 법선 사용
   * - 구면: 반경 부호에 따라 중심-입사점 벡터 방향을 맞춰 사용
   */
  private normalIntoSecondMedium(hitPoint: Vector3) {
    if (this.isPlanar()) {
      return new Vector3(0, 0, 1);
    }

    const center = this.sphereCenter();
    return this.r < 0
      ? hitPoint.clone().sub(center).normalize()
      : center.clone().sub(hitPoint).normalize();
  }

  /**
   * 주어진 XY에서 구면의 z 위치를 계산합니다.
   * - 반경이 매우 큰 경우(평면)에는 평면 z를 반환합니다.
   * - 구면 정의역 밖이면 null을 반환합니다.
   */
  private surfaceZAtXY(x: number, y: number) {
    if (this.isPlanar()) return this.position.z;
    const rhoSq = x * x + y * y;
    const rr = this.r * this.r;
    if (rhoSq > rr) return null;
    const root = Math.sqrt(Math.max(0, rr - rhoSq));
    const sag = this.r - Math.sign(this.r || 1) * root;
    return this.position.z + sag;
  }

  incident(ray: Ray): Vector3 | null {
    // 현재 광선의 마지막 점에서, 진행 방향으로 표면과 만나는 첫 교점을 찾습니다.
    const origin = ray.endPoint();
    const direction = ray.getDirection().normalize();
    const minT = 1e-6; // 자기 자신과의 수치적 재충돌 방지
    const onSurfaceTol = TORIC_ON_SURFACE_TOL_MM;
    // ST compound(back->front) 경계에서 escape step으로 origin이 front를 미세하게
    // 앞지르는 경우를 허용하기 위해 tol을 조금 크게 둡니다.
    const coincidentTol = Math.max(TORIC_COINCIDENT_SURFACE_TOL_MM, 5e-2);

    // 1) 평면 fallback: z = this.position.z 면과의 교점
    if (this.isPlanar()) {
      const dz = direction.z;
      if (!Number.isFinite(dz) || Math.abs(dz) < EPSILON) return null;

      const f0 = origin.z - this.position.z;
      if (Math.abs(f0) <= onSurfaceTol) {
        this.incidentRays.push(ray.clone());
        return origin.clone();
      }
      if (
        f0 > 0
        && f0 <= coincidentTol
        && direction.z > 0
        && this.position.z <= origin.z + coincidentTol
      ) {
        this.incidentRays.push(ray.clone());
        return origin.clone();
      }

      const t = (this.position.z - origin.z) / dz;
      if (!Number.isFinite(t) || t < minT) return null;

      const hitPoint = origin.clone().addScaledVector(direction, t);
      this.incidentRays.push(ray.clone());
      return hitPoint;
    }

    // 2) 구면: |O + tD - C|^2 = r^2 를 풀어 가장 가까운 양의 t 선택
    const zAtOriginXY = this.surfaceZAtXY(origin.x, origin.y);
    if (Number.isFinite(zAtOriginXY)) {
      const f0 = origin.z - (zAtOriginXY as number);
      if (Math.abs(f0) <= onSurfaceTol) {
        this.incidentRays.push(ray.clone());
        return origin.clone();
      }
      if (
        f0 > 0
        && f0 <= coincidentTol
        && direction.z > 0
        && this.position.z <= origin.z + coincidentTol
      ) {
        this.incidentRays.push(ray.clone());
        return origin.clone();
      }
    }

    const center = this.sphereCenter();
    const oc = origin.clone().sub(center);
    const b = 2 * direction.dot(oc);
    const c = oc.lengthSq() - this.r * this.r;
    const rawDiscriminant = b * b - 4 * c;
    if (rawDiscriminant < -1e-10) return null;
    const discriminant = Math.max(0, rawDiscriminant);

    const root = Math.sqrt(discriminant);
    const t0 = (-b - root) / 2;
    const t1 = (-b + root) / 2;
    const candidates = [t0, t1]
      .filter((t) => Number.isFinite(t) && t > minT)
      .sort((a, b2) => a - b2);
    if (!candidates.length) return null;

    const hitPoint = origin.clone().addScaledVector(direction, candidates[0]);
    this.incidentRays.push(ray.clone());
    return hitPoint;
  }

  refract(ray: Ray): Ray | null {
    const hitPoint = this.incident(ray);
    if (!hitPoint) return null;

    // 스넬의 법칙 벡터형 구현
    const incidentDir = ray.getDirection().normalize();
    const normal = this.normalIntoSecondMedium(hitPoint);

    // 법선과 입사광의 방향이 반대면 법선을 뒤집어 "2번째 매질 방향"으로 정렬
    if (normal.dot(incidentDir) < 0) {
      normal.multiplyScalar(-1);
    }

    const cos1 = Math.max(-1, Math.min(1, normal.dot(incidentDir)));
    const sin1Sq = Math.max(0, 1 - cos1 * cos1);
    const { nBefore, nAfter } = this.refractiveIndicesForRay(ray);
    const sin2 = (nBefore / nAfter) * Math.sqrt(sin1Sq);

    // 전반사(TIR)
    if (sin2 > 1 + 1e-10) return null;

    const cos2 = Math.sqrt(Math.max(0, 1 - sin2 * sin2));
    const tangent = incidentDir.clone().sub(normal.clone().multiplyScalar(cos1));
    const outDirection = tangent.lengthSq() < 1e-12
      ? incidentDir.clone()
      : normal.clone()
        .multiplyScalar(cos2)
        .add(tangent.normalize().multiplyScalar(sin2))
        .normalize();

    // 원본 광선을 복제해 굴절된 새 광선으로 이어붙입니다.
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
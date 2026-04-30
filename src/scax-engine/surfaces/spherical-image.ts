import { Vector3 } from "three";
import { EPSILON, RAY_SURFACE_ESCAPE_MM, RETINA_EXTRA_AFTER_MM } from "../parameters/constants";
import Ray from "../ray/ray";
import Surface from "./surface";
export type SphericalImageSurfaceProps = {
  type: "spherical-image";
  name: string;
  r: number;
  position: { x: number, y: number, z: number };
  tilt: { x: number, y: number };
  retina_extra_after: boolean;
}

/**
 * 곡면 표현만 하고 굴절 효과는 없습니다. 
 * 망막 위치를 표현하는 데 사용됩니다.
 */
export default class SphericalImageSurface extends Surface {
  private r: number = 0;
  private retina_extra_after: boolean = true;
  private hitPoints: Vector3[] = [];
  constructor(props: SphericalImageSurfaceProps) {
    super({ type: "spherical-image", name: props.name, position: props.position, tilt: props.tilt });
    const { r, retina_extra_after = true } = props;
    this.r = r;
    this.retina_extra_after = retina_extra_after;
  }

  /**
   * 반경 값이 비정상이면 평면(z = position.z)으로 처리합니다.
   */
  private isPlanar() {
    return !Number.isFinite(this.r) || Math.abs(this.r) > 1e12;
  }

  /**
   * 구면 중심: 꼭지점(position)에서 반경만큼 z축 이동한 점
   */
  private sphereCenter() {
    return new Vector3(this.position.x, this.position.y, this.position.z + this.r);
  }

  getHitPoints() {
    return this.hitPoints.map((point) => point.clone());
  }

  clearHitPoints() {
    this.hitPoints = [];
  }

  public override clearTraceHistory() {
    super.clearTraceHistory();
    this.clearHitPoints();
  }

  incident(ray: Ray): Vector3 | null {
    const origin = ray.endPoint();
    const direction = ray.getDirection().normalize();
    const minT = 1e-6;

    // 1) 평면 fallback
    if (this.isPlanar()) {
      const dz = direction.z;
      if (!Number.isFinite(dz) || Math.abs(dz) < EPSILON) return null;

      const t = (this.position.z - origin.z) / dz;
      if (!Number.isFinite(t) || t < minT) return null;

      const hitPoint = origin.clone().addScaledVector(direction, t);
      this.incidentRays.push(ray.clone());
      this.hitPoints.push(hitPoint.clone());
      return hitPoint;
    }

    // 2) 구면 교점 (가장 가까운 양의 t)
    const center = this.sphereCenter();
    const oc = origin.clone().sub(center);
    const b = 2 * direction.dot(oc);
    const c = oc.lengthSq() - this.r * this.r;
    const discriminant = b * b - 4 * c;
    if (discriminant < 0) return null;

    const root = Math.sqrt(discriminant);
    const t0 = (-b - root) / 2;
    const t1 = (-b + root) / 2;
    const candidates = [t0, t1]
      .filter((t) => Number.isFinite(t) && t > minT)
      .sort((a, b2) => a - b2);
    if (!candidates.length) return null;

    const hitPoint = origin.clone().addScaledVector(direction, candidates[0]);
    this.incidentRays.push(ray.clone());
    this.hitPoints.push(hitPoint.clone());
    return hitPoint;
  }

  refract(ray: Ray): Ray | null {
    const hitPoint = this.incident(ray);
    if (!hitPoint) return null;

    // 망막면은 굴절하지 않고, 입사 방향을 그대로 유지합니다.
    const outDirection = ray.getDirection().normalize();
    const tracedRay = ray.clone();
    tracedRay.appendPoint(hitPoint);

    // 망막 뒤 연장을 비활성화하면 교점에서 광선을 종료합니다.
    if (!this.retina_extra_after) {
      this.refractedRays.push(tracedRay.clone());
      return tracedRay;
    }

    tracedRay.continueFrom(
      hitPoint.clone().addScaledVector(outDirection, RAY_SURFACE_ESCAPE_MM),
      outDirection,
    );
    tracedRay.appendPoint(
      hitPoint.clone().addScaledVector(outDirection, RETINA_EXTRA_AFTER_MM),
    );

    this.refractedRays.push(tracedRay.clone());
    return tracedRay;
  }


}
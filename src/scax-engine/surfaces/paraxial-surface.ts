import { Euler, Quaternion, Vector3 } from "three";
import { EPSILON, RAY_SURFACE_ESCAPE_MM } from "../parameters/constants";
import Ray from "../ray/ray";
import TABOToDeg from "../utils/tabo-to-deg";
import Surface from "./surface";

export type ParaxialSurfaceProps = {
  type: "paraxial";
  name: string;
  position: { x: number, y: number, z: number };
  tilt: { x: number, y: number };
  s: number;
  c: number;
  ax: number;
  n: number;
}
export default class ParaxialSurface extends Surface {
  private s: number = 0;
  private c: number = 0;
  private ax: number = 0;
  private n: number = 0;

  constructor(props: ParaxialSurfaceProps) {
    super({ type: "paraxial", name: props.name, position: props.position, tilt: props.tilt });
    const { s, c, ax, n = 1.0 } = props;
    this.s = s;
    this.c = c;
    // 레거시와 동일하게 TABO 표기 축을 수학 좌표계 각도(0~180)로 변환해 저장한다.
    this.ax = TABOToDeg(ax);
    this.n = n;
  }

  /**
   * 이 surface는 입력된 d선 기준 굴절률(n)만 사용한다.
   * 파장(프라운호퍼 선) 변화에 따른 굴절률 업데이트는 클래스 외부에서 처리한다.
   */
  private lensN() {
    return this.n;
  }

  /**
   * 난시 축(ax)과 구면/난시 도수(s, c)를 2x2 파워 행렬 형태로 만든다.
   */
  private basePowerMatrix() {
    const axisRad = (this.ax * Math.PI) / 180;
    const cosA = Math.cos(axisRad);
    const sinA = Math.sin(axisRad);
    const weakMeridianPower = this.s;
    const strongMeridianPower = this.s + this.c;
    return {
      m11: weakMeridianPower * cosA * cosA + strongMeridianPower * sinA * sinA,
      m22: weakMeridianPower * sinA * sinA + strongMeridianPower * cosA * cosA,
      m12: (weakMeridianPower - strongMeridianPower) * sinA * cosA,
    };
  }

  /**
   * 사입사(광선이 비스듬히 들어오는 경우)에서 생기는 유도 구면/난시를
   * slope 기반 근사식으로 기본 파워 행렬에 반영한다.
   */
  private powerMatrixWithOblique(localIncident: Vector3, nLens: number) {
    const out = this.basePowerMatrix();
    const invZ = 1 / (Math.abs(localIncident.z) > EPSILON ? localIncident.z : EPSILON);
    const tx = localIncident.x * invZ;
    const ty = localIncident.y * invZ;
    const tanSq = tx * tx + ty * ty;
    if (tanSq <= 1e-12) return out;

    const n = nLens;
    const mean = (out.m11 + out.m22) / 2;
    const dS = (mean * tanSq) / (2 * n);
    const dC = (mean * tanSq) / n;
    const phi = Math.atan2(ty, tx);
    const c2 = Math.cos(phi) ** 2;
    const s2 = Math.sin(phi) ** 2;
    const sc = Math.sin(phi) * Math.cos(phi);

    out.m11 += dS * c2 + (dS + dC) * s2;
    out.m22 += dS * s2 + (dS + dC) * c2;
    out.m12 += (dS - (dS + dC)) * sc;
    return out;
  }

  /**
   * surface 평면(법선은 로컬 +Z)을 따라 광선이 "앞으로" 만나는 교점을 찾는다.
   */
  private intersectForward(rayOrigin: Vector3, rayDir: Vector3) {
    const normal = this.localDirToWorld(new Vector3(0, 0, 1));
    const center = this.centerWorld();
    const denom = normal.dot(rayDir);
    if (Math.abs(denom) < 1e-8) return null;
    const t = normal.dot(center.clone().sub(rayOrigin)) / denom;
    if (!Number.isFinite(t) || t <= 1e-6) return null;
    return rayOrigin.clone().addScaledVector(rayDir, t);
  }

  private centerWorld() {
    return this.position.clone();
  }

  /**
   * 표면 회전은 tilt(x,y)만 반영한다.
   * 주의: 축(ax)은 basePowerMatrix에서 이미 반영하므로 z회전을 여기서 더하지 않는다.
   */
  private worldQuaternion() {
    const tiltXRad = (this.tilt.x * Math.PI) / 180;
    const tiltYRad = (this.tilt.y * Math.PI) / 180;
    const euler = new Euler(tiltXRad, tiltYRad, 0, "XYZ");
    return new Quaternion().setFromEuler(euler);
  }

  private worldToLocalPoint(worldPoint: Vector3) {
    const inverse = this.worldQuaternion().invert();
    return worldPoint
      .clone()
      .sub(this.centerWorld())
      .applyQuaternion(inverse);
  }

  private worldDirToLocal(worldDirection: Vector3) {
    const inverse = this.worldQuaternion().invert();
    return worldDirection
      .clone()
      .applyQuaternion(inverse)
      .normalize();
  }

  private localDirToWorld(localDirection: Vector3) {
    const quaternion = this.worldQuaternion();
    return localDirection
      .clone()
      .applyQuaternion(quaternion)
      .normalize();
  }

  incident(ray: Ray): Vector3 | null {
    // 현재 광선의 끝점(origin)과 진행방향을 기준으로 surface 평면과의 교점을 계산한다.
    const hitPoint = this.intersectForward(ray.endPoint(), ray.getDirection());
    if (!hitPoint) return null;

    // 디버깅/시각화를 위해 해당 surface에 입사한 광선을 기록한다.
    this.incidentRays.push(ray.clone());
    return hitPoint;
  }

  /**
   * 박막(paraxial thin lens) 근사를 사용해 굴절 후 광선을 생성한다.
   * 1) 입사점 계산 -> 2) 로컬 좌표에서 slope 갱신 -> 3) 월드 좌표로 되돌림
   */
  refract(ray: Ray): Ray | null {
    const hitPoint = this.incident(ray);
    if (!hitPoint) return null;

    const localIncident = this.worldDirToLocal(ray.getDirection());
    const localHit = this.worldToLocalPoint(hitPoint);
    const nLens = this.lensN();
    const matrix = this.powerMatrixWithOblique(localIncident, nLens);
    const invZ = 1 / (Math.abs(localIncident.z) > EPSILON ? localIncident.z : EPSILON);
    const slopeX = localIncident.x * invZ;
    const slopeY = localIncident.y * invZ;
    const toMeters = 1 / 1000; // mm 좌표계를 SI slope 식에 맞추기 위한 스케일

    const outLocal = new Vector3(
      slopeX - toMeters * (matrix.m11 * localHit.x + matrix.m12 * localHit.y),
      slopeY - toMeters * (matrix.m12 * localHit.x + matrix.m22 * localHit.y),
      Math.sign(localIncident.z) || 1,
    ).normalize();

    const outWorld = this.localDirToWorld(outLocal);
    const refractedRay = ray.clone();
    refractedRay.appendPoint(hitPoint);
    refractedRay.continueFrom(
      hitPoint.clone().addScaledVector(outWorld, RAY_SURFACE_ESCAPE_MM),
      outWorld,
    );

    this.refractedRays.push(refractedRay.clone());
    return refractedRay;
  }

}
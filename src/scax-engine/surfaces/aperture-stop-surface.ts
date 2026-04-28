import { Euler, Quaternion, Vector3 } from "three";
import { EPSILON, RAY_SURFACE_ESCAPE_MM } from "../parameters/constants";
import Ray from "../ray/ray";
import Surface from "./surface";

export type ApertureStopSurfaceProps = {
  type: "aperture_stop";
  shape: "circle" | "rectangle";
  radius?: number;
  width?: number;
  height?: number;
  name: string;
  position: { x: number, y: number, z: number };
  tilt: { x: number, y: number };
}

export default class ApertureStopSurface extends Surface {
  private shape: "circle" | "rectangle";
  private radius: number;
  private width: number;
  private height: number;

  constructor(props: ApertureStopSurfaceProps) {
    super({
      type: "aperture_stop",
      name: props.name,
      position: props.position,
      tilt: props.tilt,
    });
    this.shape = props.shape;
    this.radius = Math.max(0, Number(props.radius ?? 0));
    this.width = Math.max(0, Number(props.width ?? 0));
    this.height = Math.max(0, Number(props.height ?? 0));
  }

  private worldQuaternion() {
    const tiltXRad = (this.tilt.x * Math.PI) / 180;
    const tiltYRad = (this.tilt.y * Math.PI) / 180;
    return new Quaternion().setFromEuler(new Euler(tiltXRad, tiltYRad, 0, "XYZ"));
  }

  private localPointFromWorld(worldPoint: Vector3) {
    const inverse = this.worldQuaternion().invert();
    return worldPoint
      .clone()
      .sub(this.position)
      .applyQuaternion(inverse);
  }

  private surfaceNormalWorld() {
    return new Vector3(0, 0, 1).applyQuaternion(this.worldQuaternion()).normalize();
  }

  private intersectForward(origin: Vector3, direction: Vector3) {
    const normal = this.surfaceNormalWorld();
    const denom = normal.dot(direction);
    if (Math.abs(denom) < EPSILON) return null;
    const t = normal.dot(this.position.clone().sub(origin)) / denom;
    if (!Number.isFinite(t) || t <= 1e-6) return null;
    return origin.clone().addScaledVector(direction, t);
  }

  private isInsideAperture(hitPointWorld: Vector3) {
    const local = this.localPointFromWorld(hitPointWorld);
    if (this.shape === "circle") {
      if (this.radius <= 0) return false;
      return Math.hypot(local.x, local.y) <= this.radius + 1e-9;
    }

    if (this.width <= 0 || this.height <= 0) return false;
    return (
      Math.abs(local.x) <= (this.width / 2) + 1e-9
      && Math.abs(local.y) <= (this.height / 2) + 1e-9
    );
  }

  incident(ray: Ray): Vector3 | null {
    const origin = ray.endPoint();
    const direction = ray.getDirection().normalize();
    const hitPoint = this.intersectForward(origin, direction);
    if (!hitPoint) return null;
    if (!this.isInsideAperture(hitPoint)) return null;
    this.incidentRays.push(ray.clone());
    return hitPoint;
  }

  refract(ray: Ray): Ray | null {
    const hitPoint = this.incident(ray);
    if (!hitPoint) return null;
    const direction = ray.getDirection().normalize();
    const passedRay = ray.clone();
    passedRay.appendPoint(hitPoint);
    passedRay.continueFrom(
      hitPoint.clone().addScaledVector(direction, RAY_SURFACE_ESCAPE_MM),
      direction,
    );
    this.refractedRays.push(passedRay.clone());
    return passedRay;
  }
}

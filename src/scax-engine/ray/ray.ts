import { Vector3 } from "three";
import { EPSILON, WAVELENGTHS } from "../parameters/constants";

const DEFAULT_DIR = new Vector3(0, 0, 1);


function isFiniteVector3(v: Vector3): boolean {
  return (
    !!v &&
    Number.isFinite(Number(v.x)) &&
    Number.isFinite(Number(v.y)) &&
    Number.isFinite(Number(v.z))
  );
}

export type RayProps = {
  origin: Vector3;
  direction: Vector3;
  frounhofer_line: 'g' | 'F' | 'e' | 'd' | 'C' | 'r';
}

/**
 * 프라운호퍼 D선 광선이 기본 입니다. 
 * 기본 색은 노란색입니다.
 */
export default class Ray {
  private points: Vector3[];
  private origin: Vector3;
  private direction: Vector3;
  private frounhofer_line: 'g' | 'F' | 'e' | 'd' | 'C' | 'r';
  private wavelengthNm: number;
  private displayColor: number;

  constructor(
    { origin, direction = new Vector3(0, 0, 1), frounhofer_line = 'd' }: RayProps
  ) {
    this.origin = isFiniteVector3(origin)
      ? origin.clone()
      : new Vector3(0, 0, 0);
    this.direction = isFiniteVector3(direction)
      ? direction.clone().normalize()
      : DEFAULT_DIR.clone();
    if (!isFiniteVector3(this.direction) || this.direction.lengthSq() < EPSILON) {
      this.direction = DEFAULT_DIR.clone();
    }
    this.frounhofer_line = frounhofer_line;
    this.wavelengthNm = WAVELENGTHS[frounhofer_line]
      ? WAVELENGTHS[frounhofer_line].nm
      : WAVELENGTHS.d.nm;
    this.displayColor = WAVELENGTHS[frounhofer_line].color;
    this.points = [this.origin.clone()];
  }

  appendPoint(point: Vector3) {
    if (!isFiniteVector3(point)) return;
    this.points.push(point.clone());
  }

  endPoint() {
    return this.points[this.points.length - 1].clone();
  }

  getDirection() {
    return this.direction.clone();
  }

  getWavelengthNm() {
    return this.wavelengthNm;
  }

  getFraunhoferLine() {
    return this.frounhofer_line;
  }

  clone() {
    const cloned = new Ray(
      {
        origin: this.origin,
        direction: this.direction,
        frounhofer_line: this.frounhofer_line
      }
    );
    cloned.points = this.points.map((point) => point.clone());
    return cloned;
  }


  continueFrom(nextOrigin: Vector3, nextDirection: Vector3) {
    if (!isFiniteVector3(nextOrigin) || !isFiniteVector3(nextDirection)) return;
    const dir = nextDirection.clone().normalize();
    if (!isFiniteVector3(dir) || dir.lengthSq() < EPSILON) return;
    this.origin.copy(nextOrigin);
    this.direction.copy(dir);
    const last = this.endPoint();
    if (last.distanceToSquared(nextOrigin) > EPSILON) {
      this.appendPoint(nextOrigin);
    }
  }
}
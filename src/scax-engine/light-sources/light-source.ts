import { Vector3 } from "three";
import Ray from "../ray/ray.js";

/** 프라우호퍼 c선 (빨강) */
export const CHROMATIC_RED_NM = 656.28;
export const CHROMATIC_RED_COLOR = 0xf87171;
/** 프라우호퍼 e선 (초록) */
export const CHROMATIC_GREEN_NM = 546.07;
export const CHROMATIC_GREEN_COLOR = 0x4ade80;

export class LightSource {
  protected rays: Ray[];
  constructor() {
    this.rays = [];
  }

  protected directionFromVergence(origin: Vector3, z: number, vergence: number): Vector3 {
    if (!Number.isFinite(vergence) || Math.abs(vergence) < 1e-12) {
      return new Vector3(0, 0, 1);
    }

    const focalDistanceMm = 1000 / Math.abs(vergence);
    const focalPoint = new Vector3(0, 0, z + (vergence > 0 ? focalDistanceMm : -focalDistanceMm));
    const direction = vergence > 0
      ? focalPoint.clone().sub(origin)
      : origin.clone().sub(focalPoint);

    if (direction.lengthSq() < 1e-12) {
      return new Vector3(0, 0, 1);
    }
    return direction.normalize();
  }

  protected createRayFromPoint(origin: Vector3, z: number, vergence: number) {
    const direction = this.directionFromVergence(origin, z, vergence);
    this.addRay(
      new Ray({
        origin,
        direction,
        frounhofer_line: "d",
      }),
    );
  }

  protected createChromaticRayFromPoint(
    origin: Vector3,
    z: number,
    vergence: number,
    line: "e" | "C",
    chromaticVergenceOffset = 0,
  ) {
    const direction = this.directionFromVergence(origin, z, vergence + chromaticVergenceOffset);
    this.addRay(
      new Ray({
        origin,
        direction,
        frounhofer_line: line,
      }),
    );
  }

  addRay(ray: Ray) {
    this.rays.push(ray.clone());
  }

  emitRays() {
    return this.rays.map((ray) => ray.clone());
  }
}

export type GridLightSourceProps = {
  width: number;
  height: number;
  division: number;
  z: number;
  vergence: number;
}
export class GridLightSource extends LightSource {
  private width: number = 0;
  private height: number = 0;
  private division: number = 0;
  private z: number = 0;
  private vergence: number = 0;
  constructor(props: GridLightSourceProps) {
    const { width, height, division = 4, z, vergence = 0 } = props;

    if (division < 4) {
      throw new Error("division must be greater than 4");
    }

    if (width < 0 || height < 0) {
      throw new Error("width and height must be greater than 0");
    }

    if (z > 0) {
      throw new Error("z must be lesser than 0");
    }
    super();
    this.width = width;
    this.height = height;
    this.division = division;
    this.z = z;
    this.vergence = vergence;

    const xStep = this.division > 1 ? this.width / (this.division - 1) : 0;
    const yStep = this.division > 1 ? this.height / (this.division - 1) : 0;
    const xStart = -this.width / 2;
    const yStart = -this.height / 2;

    for (let yi = 0; yi < this.division; yi += 1) {
      const y = yStart + yi * yStep;
      for (let xi = 0; xi < this.division; xi += 1) {
        const x = xStart + xi * xStep;
        const origin = new Vector3(x, y, this.z);
        this.createRayFromPoint(origin, this.z, this.vergence);
      }
    }
  }
}

export type GridRGLightSourceProps = GridLightSourceProps;
export class GridRGLightSource extends LightSource {
  private width: number = 0;
  private height: number = 0;
  private division: number = 0;
  private z: number = 0;
  private vergence: number = 0;
  constructor(props: GridRGLightSourceProps) {
    const { width, height, division = 4, z, vergence = 0 } = props;

    if (division < 4) {
      throw new Error("division must be greater than 4");
    }

    if (width < 0 || height < 0) {
      throw new Error("width and height must be greater than 0");
    }

    if (z > 0) {
      throw new Error("z must be lesser than 0");
    }
    super();
    this.width = width;
    this.height = height;
    this.division = division;
    this.z = z;
    this.vergence = vergence;

    const xStep = this.division > 1 ? this.width / (this.division - 1) : 0;
    const yStep = this.division > 1 ? this.height / (this.division - 1) : 0;
    const xStart = -this.width / 2;
    const yStart = -this.height / 2;

    for (let yi = 0; yi < this.division; yi += 1) {
      const y = yStart + yi * yStep;
      for (let xi = 0; xi < this.division; xi += 1) {
        const x = xStart + xi * xStep;
        const origin = new Vector3(x, y, this.z);
        this.createChromaticRayFromPoint(
          origin,
          this.z,
          this.vergence,
          "e",
        );
        this.createChromaticRayFromPoint(
          origin,
          this.z,
          this.vergence,
          "C",
        );
      }
    }
  }
}


export type RadialLightSourceProps = {
  radius: number;
  division: number;
  angle_division: number;
  z: number;
  vergence: number;
}
export class RadialLightSource extends LightSource {
  private radius: number = 0;
  private division: number = 0;
  private angle_division: number = 0;
  private z: number = 0;
  private vergence: number = 0;
  constructor(props: RadialLightSourceProps) {
    const { radius, division = 4, angle_division = 4, z, vergence = 0 } = props;
    if (radius < 0) {
      throw new Error("radius must be greater than or equal to 0");
    }

    if (division < 4) {
      throw new Error("division must be greater than 4");
    }

    if (angle_division < 4) {
      throw new Error("angle_division must be greater than 4");
    }

    if (z > 0) {
      throw new Error("z must be lesser than 0");
    }

    super();
    this.radius = radius;
    this.division = division;
    this.angle_division = angle_division;
    this.z = z;
    this.vergence = vergence;

    this.createRayFromPoint(new Vector3(0, 0, this.z), this.z, this.vergence);

    for (let ring = 1; ring <= this.division; ring += 1) {
      const ringRadius = (this.radius * ring) / this.division;
      for (let ai = 0; ai < this.angle_division; ai += 1) {
        const theta = (2 * Math.PI * ai) / this.angle_division;
        const x = ringRadius * Math.cos(theta);
        const y = ringRadius * Math.sin(theta);
        const origin = new Vector3(x, y, this.z);
        this.createRayFromPoint(origin, this.z, this.vergence);
      }
    }
  }
}
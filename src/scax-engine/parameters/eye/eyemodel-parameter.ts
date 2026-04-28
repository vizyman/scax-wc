import AsphericalSurface from "../../surfaces/aspherical-surface";
import SphericalImageSurface from "../../surfaces/spherical-image";
import SphericalSurface from "../../surfaces/spherical-surface";
import Surface from "../../surfaces/surface";

interface BaseEyeSurfaceParameter {
  name: string;
  z: number;
}

interface SphericalEyeSurfaceParameter extends BaseEyeSurfaceParameter {
  type: "spherical";
  radius: number;
  n_before: number;
  n_after: number;
}

interface AsphericalEyeSurfaceParameter extends BaseEyeSurfaceParameter {
  type: "aspherical";
  radius: number;
  conic: number;
  n_before: number;
  n_after: number;
}

interface SphericalImageEyeSurfaceParameter extends BaseEyeSurfaceParameter {
  type: "spherical-image";
  radius: number;
}

type EyeSurfaceParameter =
  | SphericalEyeSurfaceParameter
  | AsphericalEyeSurfaceParameter
  | SphericalImageEyeSurfaceParameter;

export interface EyeModelParameterConfig {
  unit: string;
  axis: string;
  origin?: string;
  surfaces: EyeSurfaceParameter[];
}

export class EyeModelParameter {
  constructor(private readonly parameter: EyeModelParameterConfig) { }

  createSurface(): Surface[] {
    return this.parameter.surfaces.map((surface) => {
      if (surface.type === "spherical") {
        return new SphericalSurface({
          type: "spherical",
          name: surface.name,
          r: surface.radius,
          position: { x: 0, y: 0, z: surface.z },
          tilt: { x: 0, y: 0 },
          n_before: surface.n_before,
          n_after: surface.n_after,
        });
      }

      if (surface.type === "aspherical") {
        return new AsphericalSurface({
          type: "aspherical",
          name: surface.name,
          position: { x: 0, y: 0, z: surface.z },
          tilt: { x: 0, y: 0 },
          r: surface.radius,
          conic: surface.conic,
          n_before: surface.n_before,
          n_after: surface.n_after,
        });
      }

      if (surface.type === "spherical-image") {
        return new SphericalImageSurface({
          type: "spherical-image",
          name: surface.name,
          r: surface.radius,
          position: { x: 0, y: 0, z: surface.z },
          tilt: { x: 0, y: 0 },
          retina_extra_after: true,
        });
      }

      throw new Error(`Unsupported surface type: ${(surface as { type: string }).type}`);
    });
  }
}
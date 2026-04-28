import { EyeModelParameter, EyeModelParameterConfig } from "./eyemodel-parameter";

export class NavarroParameter extends EyeModelParameter {
  static parameter: EyeModelParameterConfig = {
    unit: "mm",
    axis: "optical_axis_z",
    surfaces: [
      {
        type: "aspherical",
        name: "cornea_anterior",
        z: 0.0,
        radius: 7.72,
        conic: -0.26,
        n_before: 1.0,
        n_after: 1.376,
      },
      {
        type: "aspherical",
        name: "cornea_posterior",
        z: 0.55,
        radius: 6.5,
        conic: 0.0,
        n_before: 1.376,
        n_after: 1.336,
      },
      {
        type: "aspherical",
        name: "lens_anterior",
        z: 0.55 + 3.05,
        radius: 10.2,
        conic: -3.13,
        n_before: 1.336,
        n_after: 1.42,
      },
      {
        type: "aspherical",
        name: "lens_posterior",
        z: 0.55 + 3.05 + 4.0,
        radius: -6.0,
        conic: -1.0,
        n_before: 1.42,
        n_after: 1.336,
      },
      {
        type: "spherical-image",
        name: "retina",
        radius: -12.0,   // mm (대략적인 망막 곡률)
        z: 24.04   // 중심 위치
      }
    ],
  };

  constructor() {
    super(NavarroParameter.parameter);
  }
}
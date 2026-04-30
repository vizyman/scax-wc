import { Vector3 } from "three";
import {
  DEFAULT_EFFECTIVE_CYLINDER_THRESHOLD_D,
  DEFAULT_STURM_STEP_MM,
  DEFAULT_STURM_TOP2_MIN_ANGLE_GAP_DEG,
  DEFAULT_STURM_TOP2_MIN_GAP_MM,
} from "../parameters/constants";
import Ray from "../ray/ray";

type FraunhoferLine = "g" | "F" | "e" | "d" | "C" | "r";

type SturmSlice = {
  z: number;
  depth: number;
  ratio: number;
  size: number;
  profile: {
    at: { x: number; y: number; z: number };
    wMajor: number;
    wMinor: number;
    angleMajorDeg: number;
    angleMinorDeg: number;
    majorDirection: { x: number; y: number; z: number };
    minorDirection: { x: number; y: number; z: number };
  };
};

/**
 * Sturm 계산 전용 클래스입니다.
 * - traced ray 집합에서 z-scan slice를 생성하고
 * - 평탄도/최소타원/근사중심을 계산해 분석 결과를 반환합니다.
 */
export default class Sturm {
  private lastResult: unknown = null;

  public calculate(rays: Ray[], effectiveCylinderD: number, axisReferenceRays?: Ray[]) {
    const frame = this.analysisFrameFromRays(axisReferenceRays?.length ? axisReferenceRays : rays);
    const depthRange = this.depthRangeFromRays(rays, frame);
    const sturmSlices = this.collectSturmSlices(rays, frame, depthRange, DEFAULT_STURM_STEP_MM);
    const groupedByLine = this.groupByFraunhoferLine(rays);
    const sturmInfo = groupedByLine.map((group) => {
      const groupFrame = this.analysisFrameFromRays(group.rays, frame);
      const groupDepthRange = this.depthRangeFromRays(group.rays, groupFrame);
      const slices = this.collectSturmSlices(group.rays, groupFrame, groupDepthRange, DEFAULT_STURM_STEP_MM);
      const analysis = this.analyzeSturmSlices(slices, effectiveCylinderD);
      return {
        line: group.line,
        wavelength_nm: group.wavelength_nm,
        color: group.color,
        ray_count: group.rays.length,
        analysis_axis: {
          x: groupFrame.axis.x,
          y: groupFrame.axis.y,
          z: groupFrame.axis.z,
        },
        ...analysis,
      };
    });
    const result = {
      slices_info: {
        count: sturmSlices.length,
        slices: sturmSlices,
      },
      sturm_info: sturmInfo,
    };
    this.lastResult = result;
    return result;
  }

  /**
   * 마지막 Sturm 계산 결과를 반환합니다.
   */
  public getLastResult() {
    return this.lastResult;
  }

  private getRayPoints(ray: Ray) {
    const points = (ray as unknown as { points?: Vector3[] }).points;
    return Array.isArray(points) ? points : [];
  }

  private readonly lineOrder: FraunhoferLine[] = ["g", "F", "e", "d", "C", "r"];

  private analysisFrameFromRays(
    rays: Ray[],
    fallback?: { origin: Vector3; axis: Vector3; u: Vector3; v: Vector3 },
  ) {
    const axis = new Vector3();
    for (const ray of rays ?? []) axis.add(ray.getDirection());
    if (axis.lengthSq() < 1e-12) {
      if (fallback) return fallback;
      axis.set(0, 0, 1);
    } else {
      axis.normalize();
    }

    const origin = new Vector3(0, 0, 0);
    let helper = new Vector3(0, 1, 0);
    if (Math.abs(helper.dot(axis)) > 0.95) helper = new Vector3(1, 0, 0);
    const u = helper.clone().cross(axis).normalize();
    const v = axis.clone().cross(u).normalize();
    return { origin, axis, u, v };
  }

  private sampleRayPointAtDepth(
    ray: Ray,
    frame: { origin: Vector3; axis: Vector3 },
    depth: number,
  ) {
    const points = this.getRayPoints(ray);
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const da = a.clone().sub(frame.origin).dot(frame.axis);
      const db = b.clone().sub(frame.origin).dot(frame.axis);
      if ((da <= depth && depth <= db) || (db <= depth && depth <= da)) {
        const denom = db - da;
        if (Math.abs(denom) < 1e-10) return null;
        return a.clone().lerp(b, (depth - da) / denom);
      }
    }
    return null;
  }

  private depthRangeFromRays(rays: Ray[], frame: { origin: Vector3; axis: Vector3 }) {
    let depthMin = Number.POSITIVE_INFINITY;
    let depthMax = Number.NEGATIVE_INFINITY;
    for (const ray of rays ?? []) {
      for (const point of this.getRayPoints(ray)) {
        const d = point.clone().sub(frame.origin).dot(frame.axis);
        depthMin = Math.min(depthMin, d);
        depthMax = Math.max(depthMax, d);
      }
    }
    if (!Number.isFinite(depthMin) || !Number.isFinite(depthMax) || depthMax <= depthMin) return null;
    return { depthMin, depthMax };
  }

  private secondMomentProfileAtDepth(
    rays: Ray[],
    frame: { origin: Vector3; axis: Vector3; u: Vector3; v: Vector3 },
    depth: number,
  ) {
    const points: Vector3[] = [];
    for (const ray of rays) {
      const point = this.sampleRayPointAtDepth(ray, frame, depth);
      if (point) points.push(point);
    }
    if (points.length < 4) return null;

    let cxWorld = 0;
    let cyWorld = 0;
    let czWorld = 0;
    let cx = 0;
    let cy = 0;
    for (const p of points) {
      cxWorld += p.x;
      cyWorld += p.y;
      czWorld += p.z;
      const delta = p.clone().sub(frame.origin);
      cx += delta.dot(frame.u);
      cy += delta.dot(frame.v);
    }
    cxWorld /= points.length;
    cyWorld /= points.length;
    czWorld /= points.length;
    cx /= points.length;
    cy /= points.length;

    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const p of points) {
      const delta = p.clone().sub(frame.origin);
      const x = delta.dot(frame.u);
      const y = delta.dot(frame.v);
      const dx = x - cx;
      const dy = y - cy;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    sxx /= points.length;
    syy /= points.length;
    sxy /= points.length;

    const trace = sxx + syy;
    const halfDiff = (sxx - syy) / 2;
    const root = Math.sqrt(Math.max(0, halfDiff * halfDiff + sxy * sxy));
    const lambdaMajor = Math.max(0, trace / 2 + root);
    const lambdaMinor = Math.max(0, trace / 2 - root);
    const thetaRad = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const angleMajorDeg = ((thetaRad * 180) / Math.PI + 360) % 180;
    const majorDirection = frame.u.clone().multiplyScalar(Math.cos(thetaRad))
      .add(frame.v.clone().multiplyScalar(Math.sin(thetaRad)))
      .normalize();
    const minorDirection = frame.axis.clone().cross(majorDirection).normalize();

    return {
      at: { x: cxWorld, y: cyWorld, z: czWorld },
      wMajor: Math.sqrt(lambdaMajor),
      wMinor: Math.sqrt(lambdaMinor),
      angleMajorDeg,
      angleMinorDeg: (angleMajorDeg + 90) % 180,
      majorDirection: {
        x: majorDirection.x,
        y: majorDirection.y,
        z: majorDirection.z,
      },
      minorDirection: {
        x: minorDirection.x,
        y: minorDirection.y,
        z: minorDirection.z,
      },
    };
  }

  private collectSturmSlices(
    rays: Ray[],
    frame: { origin: Vector3; axis: Vector3; u: Vector3; v: Vector3 },
    depthRange: { depthMin: number; depthMax: number } | null,
    stepMm: number,
  ): SturmSlice[] {
    if (!depthRange) return [];
    const out: SturmSlice[] = [];
    for (let depth = depthRange.depthMin; depth <= depthRange.depthMax; depth += stepMm) {
      const profile = this.secondMomentProfileAtDepth(rays, frame, depth);
      if (!profile) continue;
      out.push({
        // Keep z in world coordinates for backward-compatible consumers.
        z: profile.at.z,
        // Preserve analysis-axis depth for off-axis robust ranking/interval logic.
        depth,
        ratio: profile.wMinor / Math.max(profile.wMajor, 1e-9),
        size: Math.hypot(profile.wMajor, profile.wMinor),
        profile,
      });
    }
    return out;
  }

  private axisDiffDeg(a: number, b: number) {
    const d = Math.abs((((a - b) % 180) + 180) % 180);
    return Math.min(d, 180 - d);
  }

  private buildApproxCenter(
    flattestTop2: Array<{ z: number; profile: { at: { x: number; y: number } } }>,
    smallestEllipse: { z: number; profile: { at: { x: number; y: number } } } | null,
    preferTop2Mid: boolean,
  ) {
    if (flattestTop2.length <= 0) return null;
    if (preferTop2Mid && flattestTop2.length >= 2) {
      const first = flattestTop2[0];
      const second = flattestTop2[1];
      return {
        x: (first.profile.at.x + second.profile.at.x) / 2,
        y: (first.profile.at.y + second.profile.at.y) / 2,
        z: (first.z + second.z) / 2,
        mode: "top2-mid",
      };
    }
    if (smallestEllipse) {
      return {
        x: smallestEllipse.profile.at.x,
        y: smallestEllipse.profile.at.y,
        z: smallestEllipse.z,
        mode: "min-size",
      };
    }
    const first = flattestTop2[0];
    return { x: first.profile.at.x, y: first.profile.at.y, z: first.z, mode: "top1-flat" };
  }

  private groupByFraunhoferLine(rays: Ray[]) {
    const groups = new Map<FraunhoferLine, {
      line: FraunhoferLine;
      wavelength_nm: number;
      color: number | null;
      rays: Ray[];
    }>();
    for (const ray of rays) {
      const line = ray.getFraunhoferLine() as FraunhoferLine;
      const wavelength = ray.getWavelengthNm();
      const color = Number((ray as unknown as { displayColor?: number }).displayColor);
      if (!groups.has(line)) {
        groups.set(line, {
          line,
          wavelength_nm: wavelength,
          color: Number.isFinite(color) ? color : null,
          rays: [],
        });
      }
      const group = groups.get(line);
      if (group) group.rays.push(ray);
    }
    return [...groups.values()].sort((a, b) => this.lineOrder.indexOf(a.line) - this.lineOrder.indexOf(b.line));
  }

  private analyzeSturmSlices(sturmSlices: SturmSlice[], effectiveCylinderD: number) {
    const top2MinGapMm = DEFAULT_STURM_TOP2_MIN_GAP_MM;
    const top2MinAngleGapDeg = DEFAULT_STURM_TOP2_MIN_ANGLE_GAP_DEG;
    const effectiveCylinderThresholdD = DEFAULT_EFFECTIVE_CYLINDER_THRESHOLD_D;
    const preferTop2Mid = effectiveCylinderD >= effectiveCylinderThresholdD;
    const sortedByFlatness = [...sturmSlices].sort((a, b) => a.ratio - b.ratio);
    let flattestTop2: SturmSlice[] = [];

    if (sortedByFlatness.length > 0) {
      const first = sortedByFlatness[0];
      const second = sortedByFlatness.find((candidate) => (
        Math.abs(candidate.depth - first.depth) >= top2MinGapMm
        && this.axisDiffDeg(candidate.profile.angleMajorDeg, first.profile.angleMajorDeg) >= top2MinAngleGapDeg
      ));
      flattestTop2 = second ? [first, second] : [first];
    }

    let smallestEllipse: SturmSlice | null = null;
    for (const slice of sturmSlices) {
      if (!smallestEllipse || slice.size < smallestEllipse.size) smallestEllipse = slice;
    }

    const approxCenter = this.buildApproxCenter(flattestTop2, smallestEllipse, preferTop2Mid);
    const anterior = flattestTop2[0] ?? null;
    const posterior = preferTop2Mid ? (flattestTop2[1] ?? null) : null;
    return {
      has_astigmatism: preferTop2Mid,
      method: preferTop2Mid ? "sturm-interval-midpoint" : "minimum-ellipse",
      anterior,
      posterior,
      approx_center: approxCenter,
    };
  }
}

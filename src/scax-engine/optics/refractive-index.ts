import { FRAUNHOFER_REFRACTIVE_INDICES } from "../parameters/constants";

export type FraunhoferLine = "g" | "F" | "e" | "d" | "C" | "r";
export type RefractiveIndexByLine = Partial<Record<FraunhoferLine, number>>;
export type RefractiveIndexSpec = number | RefractiveIndexByLine;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function resolveRefractiveIndex(spec: RefractiveIndexSpec, line: FraunhoferLine) {
  if (isFiniteNumber(spec)) return spec;
  const lineValue = spec[line];
  if (isFiniteNumber(lineValue)) return lineValue;
  const dValue = spec.d;
  if (isFiniteNumber(dValue)) return dValue;
  return 1.0;
}

export function normalizeRefractiveIndexSpec(spec: RefractiveIndexSpec) {
  if (!isFiniteNumber(spec)) return spec;

  const entries = Object.values(FRAUNHOFER_REFRACTIVE_INDICES);
  const matched = entries.find((item) => isFiniteNumber(item.d) && Math.abs(item.d - spec) < 1e-6);
  return matched ?? spec;
}

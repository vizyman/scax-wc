export type AffinePair = { sx: number; sy: number; tx: number; ty: number };

/**
 * 2D affine 왜곡 추정 전용 클래스입니다.
 * [x'; y'] = [[a b c], [d e f]] * [x y 1]^T 형태를 최소자승으로 적합합니다.
 */
export default class Affine {
  private lastResult: unknown = null;
  private lastPairs: AffinePair[] = [];

  public estimate(pairs: AffinePair[]) {
    const inputPairs = Array.isArray(pairs) ? pairs : [];
    this.lastPairs = inputPairs;
    const affine = this.fitAffine2D(inputPairs);
    if (!affine) {
      this.lastResult = null;
      return null;
    }

    let residualSumPct = 0;
    let residualCount = 0;
    let residualMaxPct = 0;
    const residuals: Array<{
      sx: number; sy: number; px: number; py: number; rx: number; ry: number; magnitude: number; pct: number;
    }> = [];

    for (const pair of inputPairs) {
      const px = affine.a * pair.sx + affine.b * pair.sy + affine.c;
      const py = affine.d * pair.sx + affine.e * pair.sy + affine.f;
      const rx = pair.tx - px;
      const ry = pair.ty - py;
      const magnitude = Math.hypot(rx, ry);
      if (magnitude < 1e-4) continue;
      const radiusRef = Math.hypot(px, py);
      const pct = (magnitude / Math.max(0.2, radiusRef)) * 100;
      residualSumPct += pct;
      residualCount += 1;
      residualMaxPct = Math.max(residualMaxPct, pct);
      residuals.push({ sx: pair.sx, sy: pair.sy, px, py, rx, ry, magnitude, pct });
    }

    const result = {
      ...affine,
      count: inputPairs.length,
      residualAvgPct: residualCount ? residualSumPct / residualCount : 0,
      residualMaxPct,
      residuals,
    };
    this.lastResult = result;
    return result;
  }

  /**
   * 마지막 affine 추정 결과를 반환합니다.
   */
  public getLastResult() {
    return this.lastResult;
  }

  /**
   * 마지막 affine 추정에 사용된 입력쌍을 반환합니다.
   */
  public getLastPairs() {
    return [...this.lastPairs];
  }

  private fitAffine2D(pairs: AffinePair[]) {
    if (!Array.isArray(pairs) || pairs.length < 4) return null;
    const ata: number[][] = Array.from({ length: 6 }, () => Array(6).fill(0));
    const atb = Array(6).fill(0);

    const accumulate = (row: number[], rhs: number) => {
      for (let i = 0; i < 6; i += 1) {
        atb[i] += row[i] * rhs;
        for (let j = 0; j < 6; j += 1) ata[i][j] += row[i] * row[j];
      }
    };

    for (const pair of pairs) {
      accumulate([pair.sx, pair.sy, 1, 0, 0, 0], pair.tx);
      accumulate([0, 0, 0, pair.sx, pair.sy, 1], pair.ty);
    }

    const n = 6;
    const aug = ata.map((row, index) => [...row, atb[index]]);
    for (let col = 0; col < n; col += 1) {
      let pivot = col;
      for (let row = col + 1; row < n; row += 1) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
      }
      if (Math.abs(aug[pivot][col]) < 1e-10) return null;
      if (pivot !== col) {
        const temp = aug[col];
        aug[col] = aug[pivot];
        aug[pivot] = temp;
      }
      const divider = aug[col][col];
      for (let j = col; j <= n; j += 1) aug[col][j] /= divider;
      for (let row = 0; row < n; row += 1) {
        if (row === col) continue;
        const factor = aug[row][col];
        if (Math.abs(factor) < 1e-12) continue;
        for (let j = col; j <= n; j += 1) aug[row][j] -= factor * aug[col][j];
      }
    }

    return {
      a: aug[0][n],
      b: aug[1][n],
      c: aug[2][n],
      d: aug[3][n],
      e: aug[4][n],
      f: aug[5][n],
    };
  }
}

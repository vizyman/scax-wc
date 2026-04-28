/**
 * 프라운호퍼 파장과 색상
 */
export const WAVELENGTHS = {
  g: { nm: 435.84, color: 0x8b5cf6 },   // violet / blue-violet
  F: { nm: 486.1, color: 0x3b82f6 },    // blue
  e: { nm: 546.07, color: 0x22c55e },   // green
  d: { nm: 587.56, color: 0xfacc15 },   // yellow
  C: { nm: 656.27, color: 0xef4444 },   // red
  r: { nm: 706.52, color: 0x991b1b },   // deep red
};

/**
 * 매질별 프라운오퍼 파장과 굴절률
 */
export const FRAUNHOFER_REFRACTIVE_INDICES = {
  air: {
    F: 1,
    e: 1,
    d: 1,
    C: 1,
  },
  // bk-7
  crown_glass: {
    g: 1.526684, // 435.84 nm
    F: 1.522379, // 486.10 nm
    e: 1.518722, // 546.07 nm
    d: 1.516800, // 587.56 nm
    C: 1.514322, // 656.27 nm
    r: 1.512892, // 706.52 nm
  },
  // 저굴절 CR-39 계열
  plastic_150: {
    F: 1.50738,
    e: 1.50200,
    d: 1.50000,
    C: 1.49860,
  },
  // 중굴절 MR-8 계열
  plastic_160: {
    F: 1.61800,
    e: 1.60720,
    d: 1.60000,
    C: 1.59430,
  },
  // 고굴절 MR-174
  plastic_167: {
    F: 1.68600,
    e: 1.67300,
    d: 1.67000,
    C: 1.66200,
  },
  // 초고굴절 MR-174
  plastic_174: {
    F: 1.76100,
    e: 1.74800,
    d: 1.74000,
    C: 1.73200,
  },
  cornea: {
    F: 1.377468,
    e: 1.376502,
    d: 1.376,
    C: 1.375368,
  },
  aqueous: {
    F: 1.337312,
    e: 1.336449,
    d: 1.336,
    C: 1.335435,
  },
  vitreous: {
    F: 1.337312,
    e: 1.336449,
    d: 1.336,
    C: 1.335435,
  },
  lens: {
    F: 1.407585,
    e: 1.406542,
    d: 1.406,
    C: 1.405318,
  },
  lens_anterior: {
    F: 1.387507,
    e: 1.386516,
    d: 1.386,
    C: 1.385351,
  },
  lens_nucleus_anterior: {
    F: 1.407585,
    e: 1.406542,
    d: 1.406,
    C: 1.405318,
  },
  lens_nucleus_posterior: {
    F: 1.387507,
    e: 1.386516,
    d: 1.386,
    C: 1.385351,
  },
  lens_posterior: {
    F: 1.337312,
    e: 1.336449,
    d: 1.336,
    C: 1.335435,
  },
};

/**
 * 동공 크기
 */
export const PUPIL_SIZE = {
  /** 축동 — 동공 수축 */
  constricted: 2.5,
  /** 일반 */
  neutral: 4,
  /** 산동 — 동공 확대 */
  dilated: 6,
}


/**
 * 망막 뒤 광선 연장 거리
 */
export const RETINA_EXTRA_AFTER_MM = 18.00

/**
 * epsilon
 */
export const EPSILON = 1e-9;

/**
 * 굴절 후 광선을 아주 조금 전진시켜 self-intersection을 방지하기 위한 거리(mm)
 */
export const RAY_SURFACE_ESCAPE_MM = 2e-3;

/**
 * ST(Sphere-Toric) 복합면에서 굴절력 0으로 판단하는 임계값(D)
 */
export const ST_POWER_EPS_D = 1e-9;

/**
 * ST(Sphere-Toric) 복합면의 기본 두께(mm)
 */
export const ST_DEFAULT_THICKNESS_MM = 0.05;

/**
 * 안구 보정 ST면(eye)의 기본 위치: 각막 전면 바로 앞(mm)
 */
export const EYE_ST_SURFACE_OFFSET_MM = 0.02;

/**
 * 안경 렌즈 ST면(lens)의 기본 정간거리 Vertex Distance(mm)
 */
export const SPECTACLE_VERTEX_DISTANCE_MM = 12;

/**
 * Toric 면 교점 탐색 시 현재 점과의 자기 재교차를 피하기 위한 최소 전진 거리(mm)
 */
export const TORIC_MIN_T_MM = 1e-6;

/**
 * Toric 면 교점 계산(뉴턴법) 최대 반복 횟수
 */
export const TORIC_MAX_ITERS = 24;

/**
 * 광선 시작점이 이미 Toric 면 위에 있다고 판단하는 허용 오차(mm)
 */
export const TORIC_ON_SURFACE_TOL_MM = 1e-6;

/**
 * 동일 z 부근 연속 표면에서 수치 오차로 인한 미세 간격을 허용하는 오차(mm)
 */
export const TORIC_COINCIDENT_SURFACE_TOL_MM = 3e-3;

/**
 * Sturm 분석에서 Top2 선택 시 허용하는 최소 z 간격(mm)
 */
export const DEFAULT_STURM_TOP2_MIN_GAP_MM = 0.0;

/**
 * Sturm 분석에서 Top2 선택 시 허용하는 최소 축 각도 차(도)
 */
export const DEFAULT_STURM_TOP2_MIN_ANGLE_GAP_DEG = 45;

/**
 * 실효 난시량이 이 값(D) 이상이면 U/V 중간점을 CLC 근사 중심으로 우선 사용
 */
export const DEFAULT_EFFECTIVE_CYLINDER_THRESHOLD_D = 0.125;

/**
 * Sturm z-scan 간격(mm)
 */
export const DEFAULT_STURM_STEP_MM = 0.01;

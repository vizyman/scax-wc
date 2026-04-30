# scax-wc

Lit + Three.js 기반 안경광학 시뮬레이션(단안 기준, OD) 웹 컴포넌트 입니다.

## 설치

```bash
npm install scax-wc lit three
```

## 사용법

```ts
import 'scax-wc';
```

```html
<scax-wc></scax-wc>
```

기본 크기는 `16:9` 비율이며, 부모 컨테이너 크기에 맞춰 렌더링됩니다.

### 기본 예제 (`config` 속성)

```html
<scax-wc
  config='{
    "eyeModel":"gullstrand",
    "eye":{"s":-2,"c":-0.5,"ax":180},
    "lens":[{"s":1.0,"c":-1.0,"ax":90,"diameter":6.0,"type":"lens"}],
    "light_source":{"type":"grid","width":10,"height":10,"division":4,"z":-10,"vergence":0},
    "pupil_type":"neutral"
  }'
></scax-wc>
```

### 동적 설정 및 결과 접근 (JavaScript)

```ts
import 'scax-wc';

const el = document.querySelector('scax-wc');
if (el) {
  el.config = {
    eyeModel: 'gullstrand',
    eye: { s: -2, c: -0.5, ax: 180 },
    lens: [{ s: 1.0, c: -1.0, ax: 90, diameter: 6.0, type: 'cross-cylinder' }],
    light_source: { type: 'grid', width: 10, height: 10, division: 4, z: -10, vergence: 0 },
    pupil_type: 'neutral',
  };

  const simulateResult = el.getSimulateResult();
  const sturmResult = el.getSturmResult();
  const affineResult = el.getAffineResult();
}
```

### 카메라/뷰 제어

```html
<scax-wc projection="orthogonal" enable-zoom enable-pan enable-rotate></scax-wc>
```

- `projection`: `perspective` | `orthogonal`
- `enable-zoom`: 줌 허용 여부
- `enable-pan`: 팬 허용 여부
- `enable-rotate`: 회전 허용 여부

```ts
const el = document.querySelector('scax-wc');
if (el) {
  el.projection = 'perspective';
  el.enableZoom = true;
  el.enablePan = true;
  el.enableRotate = false;

  el.setCameraPose({
    position: { x: 100, y: 90, z: -70 },
    target: { x: 0, y: 0, z: 0 },
  });
}
```

## `<scax-wc>` API

### 프로퍼티

#### `config`

- 타입: `ScaxRenderConfig`
- 속성: `config` (JSON 문자열)
- 기본값:

```json
{
  "eyeModel": "gullstrand",
  "eye": { "s": 0, "c": 0, "ax": 0 },
  "lens": [],
  "light_source": {
    "type": "grid",
    "width": 10,
    "height": 10,
    "division": 4,
    "z": -10,
    "vergence": 0
  },
  "pupil_type": "neutral"
}
```

동작 방식:

- 문자열 속성으로 전달되면 JSON으로 파싱한 뒤 기본값과 병합합니다.
- 속성이 없거나 빈 값이거나 잘못된 JSON이면 기본 설정을 사용합니다.

주요 필드:

- `eyeModel`: 안구 모델 이름 (기본값: `gullstrand`)
- `eye`: 안구 굴절 설정 (`s`, `c`, `ax`)
- `lens`: 렌즈 배열. 각 항목은 엔진 렌즈 필드와 `diameter`, `type`(`lens` | `cross-cylinder`)을 지원합니다.
- `light_source`: 광원 설정 (`type`, `width`, `height`, `division`, `z`, `vergence`)
- `pupil_type`: 동공 타입

#### `projection`

- 타입: `'perspective' | 'orthogonal'`
- 속성: `projection`
- 기본값: `perspective`

#### `enableZoom`

- 타입: `boolean`
- 속성: `enable-zoom`
- 기본값: `true`

#### `enablePan`

- 타입: `boolean`
- 속성: `enable-pan`
- 기본값: `true`

#### `enableRotate`

- 타입: `boolean`
- 속성: `enable-rotate`
- 기본값: `true`

### 메서드

#### `getSimulateResult<T = unknown>(): T | null`

- 최신 `simulate()` 결과를 반환합니다.

#### `getSturmResult<T = unknown>(): T | null`

- 최신 Sturm 계산 결과를 반환합니다.

#### `getAffineResult(): { a, b, c, d, e, f, count, residualAvgPct?, residualMaxPct?, residuals? } | null`

- 광선 추적 결과로 계산된 아핀 왜곡 추정값을 반환합니다.

#### `setCameraPose(pose: { position?: { x?: number; y?: number; z?: number }, target?: { x?: number; y?: number; z?: number } }): void`

- 현재 카메라 위치/타겟(lookAt)을 런타임에서 갱신합니다.
- 전달하지 않은 축 값은 현재 카메라 값을 유지합니다.

### 이벤트

- 현재 이 컴포넌트는 커스텀 이벤트를 디스패치하지 않습니다.

## 개발

```bash
npm install
npm run check
npm run build
```

## npm 배포

```bash
npm login
npm publish --access public
```

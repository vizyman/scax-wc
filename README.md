# scax-wc

Lit + Three.js 기반 안경광학 시뮬레이션(단안 기준, OD) 웹 컴포넌트 입니다.  
Lit + Three.js based ophthalmic optics simulation web component (monocular, OD).

![scax-wc preview](./main.png)

## SCAX란?

scax는 안경광학에서 기본적으로 쓰이는 데이터입니다. **S**는 구면렌즈 도수, **C**는 원주렌즈 도수, **AX**는 원주렌즈의 축입니다.

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
    "pupil_type":"neutral",
    "render":{"pupil":true}
  }'
  color='{
    "scene":{"background":"#020617"},
    "surface":{"apertureStop":"#000000","cornea":"#e2e8f0","compound":"#60a5fa","toric":"#a855f7","sphericalImage":"#f97316","aspherical":"#06b6d4"},
    "meridian":{"combined":{"strong":"#f59e0b","weak":"#06b6d4"},"eye":{"strong":"#38bdf8","weak":"#f472b6"},"lens":{"strong":"#3b82f6","weak":"#ec4899"}},
    "cross_cylinder":{"plus":"#ef4444","minus":"#ffffff","plusMarker":"#ef4444","minusMarker":"#ffffff","bisector":"#000000"}
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
    render: { pupil: true }, // 동공(aperture stop) 메쉬 표시
  };
  el.color = {
    scene: { background: '#020617' },
    surface: {
      apertureStop: '#000000',
      cornea: '#e2e8f0',
      compound: '#60a5fa',
      toric: '#a855f7',
      sphericalImage: '#f97316',
      aspherical: '#06b6d4',
    },
    meridian: {
      combined: { strong: '#f59e0b', weak: '#06b6d4' },
      eye: { strong: '#38bdf8', weak: '#f472b6' },
      lens: { strong: '#3b82f6', weak: '#ec4899' },
    },
    cross_cylinder: {
      plus: '#ef4444',
      minus: '#ffffff',
      plusMarker: '#ef4444',
      minusMarker: '#ffffff',
      bisector: '#000000',
    },
  };

  const simulateResult = el.getSimulateResult();
  const sturmResult = el.getSturmResult();
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

  const cameraState = el.getCameraState();
  localStorage.setItem('scax-camera-state', JSON.stringify(cameraState));

  const raw = localStorage.getItem('scax-camera-state');
  if (raw) {
    el.setCameraState(JSON.parse(raw));
  }
}
```

`getCameraState` / `setCameraState`는 `perspective`와 `orthogonal` 모두 복원할 수 있도록 `projection`, `position`, `target`, `zoom`을 포함합니다.  
`getCameraState` / `setCameraState` includes `projection`, `position`, `target`, and `zoom` so both `perspective` and `orthogonal` views can be restored.

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
  "pupil_type": "neutral",
  "render": {
    "pupil": false
  }
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
- `render.pupil`: 동공(aperture stop) 메쉬 렌더링 여부 (`true` 시 검은색 메쉬로 렌더링, 기본값: `false`)

#### `color`

- 타입: `ScaxColorTheme`
- 속성: `color` (JSON 문자열)
- 기본값: 내부 기본 팔레트(기존 하드코딩 색상과 동일)

동작 방식:

- 문자열 속성으로 전달되면 JSON으로 파싱한 뒤 기본 팔레트와 병합합니다.
- 속성이 없거나 빈 값이거나 잘못된 JSON이면 기본 팔레트를 사용합니다.

주요 필드:

- `surface`: 표면 색상 (`apertureStop`, `cornea`, `compound`, `toric`, `sphericalImage`, `aspherical`)
- `meridian.combined`: 결합 난시 메리디안 색상 (`strong`, `weak`)
- `meridian.eye`: 안구 메리디안 색상 (`strong`, `weak`)
- `meridian.lens`: 안경 렌즈 메리디안 색상 (`strong`, `weak`)
- `cross_cylinder`: 크로스 실린더 색상 (`plus`, `minus`, `plusMarker`, `minusMarker`, `bisector`)
- `scene.background`: Three.js scene 배경색

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

#### `getCameraState(): { projection: 'perspective' | 'orthogonal', position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, zoom: number }`

- 현재 카메라 상태 스냅샷을 반환합니다.
- Returns a serializable snapshot of the current camera state.

#### `setCameraState(state: { projection?: 'perspective' | 'orthogonal', position?: { x?: number; y?: number; z?: number }, target?: { x?: number; y?: number; z?: number }, zoom?: number }): void`

- 카메라 상태를 런타임에서 복원합니다.
- `projection`, `position`, `target`, `zoom`을 적용하여 `perspective`/`orthogonal` 뷰를 모두 복원할 수 있습니다.
- 생략된 값은 현재 상태를 유지합니다.
- Restores camera state at runtime.
- Applies `projection`, `position`, `target`, and `zoom` to restore both `perspective` and `orthogonal` views.
- Omitted fields keep their current values.

### 이벤트

- `simulation-complete`
  - 시뮬레이션 파이프라인과 씬 재구성이 끝난 뒤 발생합니다.
  - `event.detail.simulationResult`: 최신 `simulate()` 결과
  - `event.detail.sturmResult`: 최신 Sturm 계산 결과

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

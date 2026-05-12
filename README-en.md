# scax-wc

Lit + Three.js based ophthalmic optics simulation web component (monocular, OD).

- Accuracy increases as rays become more paraxial.
- This project supports monocular visualization.
- Prism diopter visualization is planned for future implementation.
- Due to limitations of the model eye, there are no plans to support Add visualization.

## What is SCAX?

In ophthalmic optics, **SCAX** is the standard notation for prescription data: **S** is spherical lens power, **C** is cylindrical lens power, and **AX** is the axis of the cylinder.

## Install

```bash
npm install scax-wc lit three
```

## Usage

```ts
import 'scax-wc';
```

```html
<scax-wc></scax-wc>
```

The default size uses a `16:9` aspect ratio and renders to fit its parent container.

### Basic Example (`config` attribute)

```html
<scax-wc
  config='{
    "eyeModel":"gullstrand",
    "eye":{"s":-2,"c":-0.5,"ax":180},
    "lens":[{"s":1.0,"c":-1.0,"ax":90,"diameter":6.0,"type":"lens"}],
    "light_source":{"type":"grid","width":10,"height":10,"division":4,"z":-10,"vergence":0},
    "pupil_type":"neutral"
  }'
  color='{
    "scene":{"background":"#020617"},
    "surface":{"apertureStop":"#000000","cornea":"#e2e8f0","compound":"#60a5fa","toric":"#a855f7","sphericalImage":"#f97316","aspherical":"#06b6d4"},
    "meridian":{"eye":{"first":"#f472b6","second":"#38bdf8"},"combined":{"first":"#06b6d4","second":"#f59e0b"},"lens":{"first":"#ec4899","second":"#3b82f6"}},
    "cross_cylinder":{"plus":"#ef4444","minus":"#ffffff","plusMarker":"#ef4444","minusMarker":"#ffffff","bisector":"#000000"}
  }'
></scax-wc>
```

### Dynamic Configuration and Result Access (JavaScript)

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
      eye: { first: '#f472b6', second: '#38bdf8' },
      combined: { first: '#06b6d4', second: '#f59e0b' },
      lens: { first: '#ec4899', second: '#3b82f6' },
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

### Camera/View Controls

```html
<scax-wc projection="orthogonal" enable-zoom enable-pan enable-rotate></scax-wc>
```

- `projection`: `perspective` | `orthogonal`
- `enable-zoom`: enables zoom interaction
- `enable-pan`: enables pan interaction
- `enable-rotate`: enables orbit rotation interaction

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

`getCameraState` / `setCameraState` includes `projection`, `position`, `target`, and `zoom` so both `perspective` and `orthogonal` views can be restored.

## `<scax-wc>` API

### Properties

#### `config`

- Type: `ScaxRenderConfig`
- Attribute: `config` (JSON string)
- Default:

```json
{
  "eyeModel": "gullstrand",
  "eye": { "s": 0, "c": 0, "ax": 0 },
  "lens": [],
  "light_source": { "type": "grid", "width": 10, "height": 10, "division": 4, "z": -10, "vergence": 0 },
  "pupil_type": "neutral"
}
```

Behavior:
- When passed as a string attribute, the value is parsed as JSON and merged with defaults.
- If the attribute is missing, empty, or invalid JSON, default settings are used.

Key fields:
- `eyeModel`: Eye model name (default: `gullstrand`)
- `eye`: Eye refraction settings (`s`, `c`, `ax`)
- `lens`: Lens array. Each item supports engine lens fields plus `diameter` and `type` (`lens` | `cross-cylinder`)
- `light_source`: Light source settings (`type`, `width`, `height`, `division`, `z`, `vergence`)
- `pupil_type`: Pupil type

#### `color`

- Type: `ScaxColorTheme`
- Attribute: `color` (JSON string)
- Default: internal default palette (same as previous hard-coded colors)

Behavior:
- When passed as a string attribute, the value is parsed as JSON and merged with the default palette.
- If the attribute is missing, empty, or invalid JSON, the default palette is used.

Key fields:
- `surface`: surface colors (`apertureStop`, `cornea`, `compound`, `toric`, `sphericalImage`, `aspherical`)
- `meridian`: three groups **`eye`**, **`combined`**, **`lens`**, each with `first` / `second`. Sort astigmatism summary rows by **clinical TABO ascending**; lowest TABO → `first`, next → `second`. Eye dashed overlays use `eye`, cornea combined solid lines use `combined`, toric lens overlays use `lens`. **Sturm focal lines and approx markers** use **`combined` only** (with `first`/`second` applied in reverse order compared to the cornea combined overlay). **`cross-cylinder`** lenses use only `cross_cylinder`.
- `cross_cylinder`: cross-cylinder colors (`plus`, `minus`, `plusMarker`, `minusMarker`, `bisector`)
- `scene.background`: Three.js scene background color

Legacy JSON: `weak` / `strong` under each group merge into `first` / `second`. Older unified `meridian.first` / `second` merge into **`combined`**.

#### `projection`

- Type: `'perspective' | 'orthogonal'`
- Attribute: `projection`
- Default: `perspective`

#### `enableZoom`

- Type: `boolean`
- Attribute: `enable-zoom`
- Default: `true`

#### `enablePan`

- Type: `boolean`
- Attribute: `enable-pan`
- Default: `true`

#### `enableRotate`

- Type: `boolean`
- Attribute: `enable-rotate`
- Default: `true`

### Methods

#### `getSimulateResult<T = unknown>(): T | null`

- Returns the latest `simulate()` result.

#### `getSturmResult<T = unknown>(): T | null`

- Returns the latest Sturm calculation result.

#### `getCameraState(): { projection: 'perspective' | 'orthogonal', position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, zoom: number }`

- Returns a serializable snapshot of the current camera state.

#### `setCameraState(state: { projection?: 'perspective' | 'orthogonal', position?: { x?: number; y?: number; z?: number }, target?: { x?: number; y?: number; z?: number }, zoom?: number }): void`

- Restores camera state at runtime.
- Applies `projection`, `position`, `target`, and `zoom` to restore both `perspective` and `orthogonal` views.
- Omitted fields keep their current values.

### Events

#### `simulation-complete`

| | |
| --- | --- |
| Event name string | `simulation-complete` |
| Package constant | `SCAX_SIMULATION_COMPLETE_EVENT` (`'simulation-complete'`) |
| DOM event type | `CustomEvent<ScaxSimulationCompleteDetail>` |
| Propagation | `bubbles: true`, `composed: true` (bubbles out of Shadow DOM) |

When it fires: immediately after the internal simulation pipeline and Three.js scene rebuild finish.

#### `event.detail`: `ScaxSimulationCompleteDetail`

Import the type and constant from `scax-wc`:

```ts
import {
  SCAX_SIMULATION_COMPLETE_EVENT,
  type ScaxSimulationCompleteDetail,
} from 'scax-wc';
```

Shape:

```ts
interface ScaxSimulationCompleteDetail {
  /** Result of `engine.simulate()`. May be `null` before the first successful run. */
  simulationResult: SimulateResult | null;
  /** Result of `engine.sturmCalculation(...)`. Also nullable. */
  sturmResult: SturmResult | null;
}
```

Payload types are defined in **`scax-engine`** (`SimulateResult` and `SturmResult` are re-exported from `scax-wc`).

- **`SimulateResult`**

```ts
import type { SimulateResult } from 'scax-wc'; // or `scax-engine`

type SimulateResult = {
  /** Traced rays; each entry is a `Ray` instance from `scax-engine` (uses `three` `Vector3`, etc.). */
  traced_rays: import('scax-engine').Ray[];
};
```

- **`SturmResult`** — same as the return type of `Sturm#calculate()`. Field-level overview (see `scax-engine` Sturm analysis for semantics):

```ts
import type { SturmResult } from 'scax-wc'; // or `scax-engine`

type FraunhoferLine = 'g' | 'F' | 'e' | 'd' | 'C' | 'r';

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
    /** Astigmatic phasor in double-angle space (cos 2θ, sin 2θ); θ = meridian angle (rad) */
    j0: number;
    j45: number;
    angleMinorDeg: number;
    majorDirection: { x: number; y: number; z: number };
    minorDirection: { x: number; y: number; z: number };
  };
};

type SturmResult = {
  slices_info: { count: number; slices: SturmSlice[] };
  sturm_info: {
    has_astigmatism: boolean;
    method: string;
    anterior: SturmSlice;
    posterior: SturmSlice | null;
    approx_center: { x: number; y: number; z: number; mode: string } | null;
    line: FraunhoferLine;
    wavelength_nm: number;
    color: number | null;
    ray_count: number;
    analysis_axis: { x: number; y: number; z: number };
  }[];
};
```

#### Typed listener example

```ts
import {
  SCAX_SIMULATION_COMPLETE_EVENT,
  type ScaxSimulationCompleteDetail,
} from 'scax-wc';

const el = document.querySelector('scax-wc');
el?.addEventListener(SCAX_SIMULATION_COMPLETE_EVENT, (ev: Event) => {
  const { detail } = ev as CustomEvent<ScaxSimulationCompleteDetail>;
  const { simulationResult, sturmResult } = detail;
  // simulationResult?.traced_rays, sturmResult?.sturm_info, etc.
});
```

## Development

```bash
npm install
npm run check
npm run build
```

## Publish to npm

```bash
npm login
npm publish --access public
```

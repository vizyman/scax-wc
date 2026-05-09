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
    "meridian":{"combined":{"strong":"#f59e0b","weak":"#06b6d4"},"eye":{"strong":"#38bdf8","weak":"#f472b6"},"lens":{"strong":"#3b82f6","weak":"#ec4899"}},
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
- `meridian.combined`: combined astigmatism meridian colors (`strong`, `weak`)
- `meridian.eye`: eye meridian colors (`strong`, `weak`)
- `meridian.lens`: spectacle lens meridian colors (`strong`, `weak`)
- `cross_cylinder`: cross-cylinder colors (`plus`, `minus`, `plusMarker`, `minusMarker`, `bisector`)
- `scene.background`: Three.js scene background color

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

- `simulation-complete`
  - Fired after simulation pipeline and scene rebuild complete.
  - `event.detail.simulationResult`: latest `simulate()` result
  - `event.detail.sturmResult`: latest Sturm calculation result

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

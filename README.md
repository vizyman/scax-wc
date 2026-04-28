# scax-wc

Lit + Three.js based web component library.

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

  const simulateResult = el.getSimulateResult();
  const sturmResult = el.getSturmResult();
  const affineResult = el.getAffineResult();
}
```

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

### Methods

#### `getSimulateResult<T = unknown>(): T | null`

- Returns the latest `simulate()` result.

#### `getSturmResult<T = unknown>(): T | null`

- Returns the latest Sturm calculation result.

#### `getAffineResult(): { a, b, c, d, e, f, count, residualAvgPct?, residualMaxPct?, residuals? } | null`

- Returns affine distortion estimation values calculated from ray tracing results.

### Events

- This component currently does not dispatch custom events.

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

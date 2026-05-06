import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const external = []; //['lit', 'lit/decorators.js', 'three'];
const basePlugins = [
  resolve({
    browser: true,
  }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    declaration: false,
    declarationMap: false,
  }),
];

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/scax-wc.esm.js',
        format: 'es',
        sourcemap: true,
      },
      {
        file: 'dist/scax-wc.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
    ],
    external,
    plugins: basePlugins,
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/scax-wc.umd.js',
      format: 'umd',
      name: 'ScaxWc',
      sourcemap: true,
      exports: 'named',
    },
    plugins: basePlugins,
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/scax-wc.d.ts',
      format: 'es',
    },
    external,
    plugins: [dts()],
  },
];

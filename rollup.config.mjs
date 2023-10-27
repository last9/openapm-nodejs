import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

const babelPlugin = babel({
  babelHelpers: 'bundled',
  exclude: /node_modules/,
  extensions: ['.ts', '.tsx', '.native.ts']
});

export default [
  // CommonJS (cjs) build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/cjs/index.js',
      format: 'cjs'
    },
    plugins: [resolve(), commonjs(), typescript(), json(), babelPlugin]
  },
  // ECMAScript Module (esm) build
  {
    input: 'src/index.ts', // Your TypeScript library entry point
    output: {
      file: 'dist/esm/index.js',
      format: 'esm'
    },
    plugins: [resolve(), commonjs(), typescript(), json()]
  }
];

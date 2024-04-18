import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: [
      'src/index.ts'
      // 'src/clients/nextjs/index.ts',
      // 'src/clients/nextjs/loader.ts'
    ],
    sourcemap: true,
    format: ['cjs', 'esm'],
    legacyOutput: true,
    cjsInterop: true,
    // minify: true,
    treeshake: true,
    shims: true,
    external: ['mysql2', '@nestjs/core', 'next', 'express', 'webpack'],
    dts: true
  }
  // {
  //   entry: ['src/clients/nextjs/templates/server-component.ts'],
  //   external: ['react', 'HANDLER_FILE_PATH'],
  //   format: ['cjs'],
  //   legacyOutput: true,
  //   cjsInterop: true,
  //   treeshake: true,
  //   shims: true,
  //   outDir: 'dist/clients/nextjs/templates'
  // },
  // {
  //   entry: ['src/clients/nextjs/templates/server-component.ts'],
  //   external: ['react', 'HANDLER_FILE_PATH'],
  //   format: ['esm'],
  //   legacyOutput: true,
  //   cjsInterop: true,
  //   treeshake: true,
  //   outDir: 'dist/esm/clients/nextjs/templates'
  // }
]);

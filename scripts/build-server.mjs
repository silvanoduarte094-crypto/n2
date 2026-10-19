import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'server/dist/server.cjs',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

console.log('N2 bridge built at server/dist/server.cjs');

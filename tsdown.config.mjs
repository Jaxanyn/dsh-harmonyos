export default {
  entry: ['src/index.ts', 'src/client/index.tsx'],
  outDir: 'lib',
  format: ['esm'],
  dts: true,
  clean: true,
  external: [/^@deepseek-ai\//, 'react', 'react-dom', 'react/jsx-runtime']
}

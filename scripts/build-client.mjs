import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const result = await build({ entryPoints:[resolve(root,'src/client/index.tsx')], bundle:true, format:'cjs', platform:'browser', write:false, jsx:'automatic', external:['react','react-dom','react-dom/client','react/jsx-runtime'] })
const out=resolve(root,'lib/client.js'); await mkdir(dirname(out),{recursive:true}); await writeFile(out, 'window.__ModuleLoader__.load({ id: "dsh-harmonyos-plugin", factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;\n'+result.outputFiles[0].text+'\nreturn module.exports; } });\n')

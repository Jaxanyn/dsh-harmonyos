import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
test('coordinate helper contract is present',()=>{const source=readFileSync('src/client/index.tsx','utf8');assert.match(source,/normalizeCoordinate/);assert.match(source,/Math\.min\(1, Math\.max\(0/)})
test('bundle registers the actual ModuleLoader wrapper',()=>{let registered;const sandbox={window:{__ModuleLoader__:{load:value=>{registered=value}}}};vm.createContext(sandbox);vm.runInContext(readFileSync('lib/client.js','utf8'),sandbox);assert.equal(registered.id,'dsh-harmonyos');assert.equal(typeof registered.factory,'function')})

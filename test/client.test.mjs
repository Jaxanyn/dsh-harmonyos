import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
test('coordinate helper contract is present',()=>{const source=readFileSync('src/client/index.tsx','utf8');assert.match(source,/normalizeCoordinate/);assert.match(source,/Math\.min\(1, Math\.max\(0/)})
test('client uses the native tool view and right sidebar surface',()=>{const source=readFileSync('src/client/index.tsx','utf8');assert.match(source,/tool\.call\.toolview/);assert.match(source,/tool\.details\.toolview/);assert.match(source,/function DetailsPanel/);assert.match(source,/function openIfIdle/);assert.match(source,/harmony_preview_start/);assert.match(source,/props\?\.block/);assert.match(source,/data-state=\{state\}/);assert.match(source,/position:absolute;top:0;right:0;bottom:0/);assert.match(source,/Recents/);assert.match(source,/Rotate view/);assert.match(source,/visibilityState/)})
test('preview polling does not block or drop device controls',()=>{const source=readFileSync('src/client/index.tsx','utf8');assert.match(source,/refreshing: boolean/);assert.match(source,/refreshAgain: boolean/);assert.match(source,/controlQueue/);assert.match(source,/refreshAfterControl/);assert.match(source,/if \(controller\.refreshing\) controller\.refreshAgain = true/);assert.match(source,/if \(!controller\.session\?\.connected\) return/);assert.match(source,/void refresh\(controller\)/)})
test('device controls expose latency and progress state',()=>{const source=readFileSync('src/client/index.tsx','utf8');assert.match(source,/controlState: ControlState/);assert.match(source,/lastControlMs/);assert.match(source,/controller\.controlState === 'sending'/);assert.match(source,/controller\.controlState === 'refreshing'/);assert.match(source,/controller\.controlState === 'error'/)})
test('preview toolbar provides bounded quick zoom modes',()=>{const source=readFileSync('src/client/index.tsx','utf8');assert.match(source,/dsh-hm-zoom-group/);assert.match(source,/setZoom\(\.75\)/);assert.match(source,/setZoom\(1\.25\)/);assert.match(source,/dsh-hm-stage-zoomed/)})
test('bundle registers the actual ModuleLoader wrapper',()=>{let registered;const sandbox={window:{__ModuleLoader__:{load:value=>{registered=value}}}};vm.createContext(sandbox);vm.runInContext(readFileSync('lib/client.js','utf8'),sandbox);assert.equal(registered.id,'dsh-harmonyos-plugin');assert.equal(typeof registered.factory,'function')})
test('tool result parser handles DSH text content arrays',async()=>{const {toolResultSessionId}=await import('../lib/client/index.mjs?result-test='+Date.now());assert.equal(toolResultSessionId({content:[{type:'text',text:'{"sessionId":"session-1"}'}]}),'session-1');assert.equal(toolResultSessionId({result:{sessionId:'session-2'}}),'session-2');assert.equal(toolResultSessionId({output:'{"deviceId":"device-1"}'}),undefined)})
test('preview result retains the complete device session', async () => {
  const { toolResultSession } = await import('../lib/client/index.mjs')
  const session = { sessionId: 'preview-1', deviceId: 'device-1', connected: true, frameId: 7, width: 1600, height: 2560 }
  assert.deepEqual(toolResultSession({ content: [{ type: 'text', text: JSON.stringify(session) }] }), session)
  assert.deepEqual(toolResultSession({ result: session }), session)
  assert.equal(toolResultSession({ content: [{ type: 'text', text: '{"sessionId":"incomplete"}' }] }), undefined)
})
test('rendered frame uses the downloaded image URL', () => {
  const source = readFileSync('src/client/index.tsx', 'utf8')
  const frame = source.slice(source.indexOf('function Frame('), source.indexOf('function saveFrame('))
  assert.match(frame, /src=\{controller\.frame\.url\}/)
})
test('completed tool result seeds the panel and retries an empty frame', async () => {
  let registration, portal
  const effects = [], calls = [], views = new Map()
  const session = { sessionId: 'device-preview', deviceId: 'device-1', connected: true, frameId: 0 }
  const react = {
    useEffect: effect => effects.push(effect), useRef: value => ({ current: value }),
    useSyncExternalStore: () => {}, useState: value => [value, () => {}],
  }
  const sandbox = {
    window: { __ModuleLoader__: { load: value => { registration = value } } },
    document: { getElementById: () => null, createElement: () => ({}), head: { append() {} }, body: { append() {} } },
    fetch: async (url, init) => {
      calls.push({ url, init })
      if (url.endsWith('/grant')) return { ok: true, json: async () => ({ token: 'scoped', expiresAt: Date.now() + 60000 }) }
      if (url.includes('/status?')) return { ok: true, json: async () => session }
      if (url.includes('/frame?')) return { ok: true, status: 204 }
      throw new Error('Unexpected request: ' + url)
    },
  }
  vm.createContext(sandbox)
  vm.runInContext(readFileSync('lib/client.js', 'utf8'), sandbox)
  const client = registration.factory(name => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    if (name === 'react-dom/client') return { createRoot: () => ({ render: value => { portal = value } }) }
    throw new Error('Unexpected module: ' + name)
  })
  client.apply({ slots: { inject: (_name, factory) => factory(), register: (definition, component) => views.set(definition.name + ':' + definition.key, component) } })
  const card = views.get('tool.call.toolview:harmony_preview_start')({
    toolName: 'harmony_preview_start', sessionId: 'harness-conversation', callId: 'call-1',
    block: { kind: 'tool-result', content: [{ type: 'text', text: JSON.stringify(session) }] },
  })
  for (const effect of effects.splice(0)) effect()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(JSON.parse(calls[0].init.body).sessionId, 'device-preview')
  assert.ok(calls.some(call => call.url.includes('/frame?sessionId=device-preview')))
  const panel = portal.type(portal.props)
  assert.equal(panel.props.controller.session.connected, true)
  assert.equal(panel.props.controller.error, undefined)
  calls.length = 0
  card.props.children.at(-1).props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(calls.some(call => call.url.includes('/frame?sessionId=device-preview')))
})
test('compiled client registers keyed tool and details slots',async()=>{const previous=globalThis.document;globalThis.document={getElementById:()=>null,createElement:()=>({}),head:{append(){}}};try{const {apply}=await import('../lib/client/index.mjs?slot-test='+Date.now());const records=[];const ctx={slots:{inject:(name,factory)=>records.push({name,definition:factory()}),register:definition=>definition}};apply(ctx);assert.equal(records.filter(item=>item.name==='tool.call.toolview').length,9);assert.equal(records.filter(item=>item.name==='tool.details.toolview').length,9);assert.ok(records.some(item=>item.definition.key==='harmony_list_apps'));assert.ok(records.some(item=>item.definition.key==='harmony_launch_app'));assert.ok(records.some(item=>item.definition.key==='harmony_preview_start'))}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous}})

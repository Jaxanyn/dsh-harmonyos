import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { capture, inputText, keyEvent, listApps, listDevices, longPress, swipe, tap } from './hdc.js'
import { buildAndRun } from './build.js'
import { explainHdcError, HdcError } from './errors.js'
import { getSession, listSessions, resolveDevice, startSession, stopSession } from './session.js'

const jsonResult = (value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }]

function requiredNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new HdcError(key + ' is required and must be a finite number.')
  return value
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value) throw new HdcError(key + ' is required.')
  return value
}

const devicesTool = defineTool({
  name: 'harmony_devices',
  description: 'List connected pure HarmonyOS devices available through HDC.',
  parameters: {},
  output: { schema: { type: 'object', additionalProperties: false, properties: { devices: { type: 'array' } } }, render: (_args, value) => jsonResult(value) },
  async execute() {
    const devices = await listDevices()
    return { devices: devices.map(({ serial, state }) => ({ serial, state })) }
  },
})

const listAppsTool = defineTool({
  name: 'harmony_list_apps',
  description: 'List HarmonyOS application bundle names installed on a connected device through HDC.',
  parameters: { deviceId: { type: 'string', required: true }, query: { type: 'string', description: 'Optional case-insensitive bundle-name filter.' } },
  output: { schema: { type: 'object', additionalProperties: false, properties: { deviceId: { type: 'string' }, apps: { type: 'array', items: { type: 'string' } } } }, render: (_args, value) => jsonResult(value) },
  async execute(args) {
    const apps = await listApps(args.deviceId)
    const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
    return { deviceId: args.deviceId, apps: query ? apps.filter(app => app.toLowerCase().includes(query)) : apps }
  },
})

const previewStartTool = defineTool({
  name: 'harmony_preview_start',
  description: 'Start a live preview session for a connected pure HarmonyOS device.',
  parameters: { deviceId: { type: 'string', description: 'HDC serial. Omit to use the first connected device.' } },
  output: { schema: { type: 'object', additionalProperties: false, properties: { sessionId: { type: 'string' }, deviceId: { type: 'string' }, connected: { type: 'boolean' }, startedAt: { type: 'string' }, frameId: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } } }, render: (_args, value) => jsonResult(value) },
  async execute(args) { return startSession(args.deviceId) },
})

const previewStopTool = defineTool({
  name: 'harmony_preview_stop',
  description: 'Stop an active HarmonyOS preview session.',
  parameters: { sessionId: { type: 'string', required: true } },
  output: { schema: { type: 'object', additionalProperties: false, properties: { sessionId: { type: 'string' }, deviceId: { type: 'string' }, connected: { type: 'boolean' } } }, render: (_args, value) => jsonResult(value) },
  async execute(args) { return stopSession(args.sessionId) },
})

const previewInfoTool = defineTool({
  name: 'harmony_preview_info',
  description: 'Return active HarmonyOS preview sessions.',
  parameters: {},
  output: { schema: { type: 'object', additionalProperties: false, properties: { sessions: { type: 'array' } } }, render: (_args, value) => jsonResult(value) },
  async execute() {
    const sessions = listSessions()
    return { sessions: sessions.map(({ sessionId, deviceId, startedAt, connected }) => ({ sessionId, deviceId, startedAt, connected })) }
  },
})

const screenshotTool = defineTool({
  name: 'harmony_screenshot',
  description: 'Capture the current screen of a connected pure HarmonyOS device.',
  parameters: { deviceId: { type: 'string', description: 'HDC serial. Omit to use the first connected device.' } },
  output: { schema: { type: 'object', additionalProperties: false, properties: { deviceId: { type: 'string' }, mimeType: { type: 'string' }, base64: { type: 'string' } } }, render: (_args, value) => jsonResult(value) },
  async execute(args) {
    const deviceId = await resolveDevice(args.deviceId)
    const frame = await capture(deviceId)
    return { deviceId, mimeType: frame.mimeType, base64: frame.data.toString('base64') }
  },
})

const interactTool = defineTool({
  name: 'harmony_interact',
  description: 'Interact with a pure HarmonyOS device through HDC using pixel coordinates.',
  parameters: {
    deviceId: { type: 'string', required: true },
    action: { type: 'string', enum: ['tap', 'swipe', 'long_press', 'button', 'type'], required: true },
    x: { type: 'number' }, y: { type: 'number' },
    fromX: { type: 'number' }, fromY: { type: 'number' }, toX: { type: 'number' }, toY: { type: 'number' },
    velocity: { type: 'number', description: 'Swipe velocity in pixels per second, 200..40000.' }, durationMs: { type: 'number', description: 'Unsupported for long_press; passing it is rejected by HDC.' }, key: { type: 'string', description: 'button key: back, home, recent, or power.' }, text: { type: 'string' },
  },
  output: { schema: { type: 'object', additionalProperties: false, properties: { deviceId: { type: 'string' }, action: { type: 'string' }, connected: { type: 'boolean' } } }, render: (_args, value) => jsonResult(value) },
  async execute(args) {
    if (args.action === 'tap') await tap(args.deviceId, requiredNumber(args, 'x'), requiredNumber(args, 'y'))
    else if (args.action === 'swipe') await swipe(args.deviceId, requiredNumber(args, 'fromX'), requiredNumber(args, 'fromY'), requiredNumber(args, 'toX'), requiredNumber(args, 'toY'), args.velocity)
    else if (args.action === 'long_press') await longPress(args.deviceId, requiredNumber(args, 'x'), requiredNumber(args, 'y'), args.durationMs)
    else if (args.action === 'button') await keyEvent(args.deviceId, requiredString(args, 'key'))
    else if (args.action === 'type') await inputText(args.deviceId, requiredString(args, 'text'))
    return { deviceId: args.deviceId, action: args.action, connected: true }
  },
})

const buildRunTool = defineTool({
  name: 'harmony_build_run',
  description: 'Build a pure HarmonyOS Stage project, install its HAP through HDC, and launch the explicitly named ability.',
  parameters: {
    projectPath: { type: 'string', required: true }, deviceId: { type: 'string', required: true },
    bundleName: { type: 'string', required: true }, abilityName: { type: 'string', required: true },
    module: { type: 'string', required: true }, product: { type: 'string', required: true }, target: { type: 'string', required: true },
    buildMode: { type: 'string', enum: ['debug', 'release'] }, hapPath: { type: 'string' }, timeoutMs: { type: 'number' },
  },
  output: { schema: { type: 'object', additionalProperties: false, properties: { projectPath: { type: 'string' }, hapPath: { type: 'string' }, bundleName: { type: 'string' }, abilityName: { type: 'string' }, deviceId: { type: 'string' }, built: { type: 'boolean' }, installed: { type: 'boolean' }, started: { type: 'boolean' } } }, render: (_args, value) => jsonResult(value) },
  async execute(args) { return buildAndRun(args) },
})

export const harmonyTools: ToolDefinition[] = [devicesTool, listAppsTool, previewStartTool, previewStopTool, previewInfoTool, screenshotTool, interactTool, buildRunTool]
export { explainHdcError, getSession }

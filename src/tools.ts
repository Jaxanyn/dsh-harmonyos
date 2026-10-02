import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { capture, inputText, keyEvent, listDevices, longPress, swipe, tap } from './hdc.js'
import { explainHdcError } from './errors.js'
import { getSession, listSessions, resolveDevice, startSession, stopSession } from './session.js'

const jsonResult = (value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }]

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

const previewStartTool = defineTool({
  name: 'harmony_preview_start',
  description: 'Start a live preview session for a connected pure HarmonyOS device.',
  parameters: { deviceId: { type: 'string', description: 'HDC serial. Omit to use the first connected device.' } },
  output: { schema: { type: 'object', additionalProperties: false, properties: { sessionId: { type: 'string' }, deviceId: { type: 'string' }, connected: { type: 'boolean' }, startedAt: { type: 'string' } } }, render: (_args, value) => jsonResult(value) },
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
    velocity: { type: 'number', description: 'Swipe velocity in pixels per second, 200..40000.' }, durationMs: { type: 'number', description: 'Unsupported for long_press; passing it is rejected by HDC.' }, key: { type: 'string' }, text: { type: 'string' },
  },
  output: { schema: { type: 'object', additionalProperties: false, properties: { deviceId: { type: 'string' }, action: { type: 'string' }, connected: { type: 'boolean' } } }, render: (_args, value) => jsonResult(value) },
  async execute(args) {
    if (args.action === 'tap') await tap(args.deviceId, args.x ?? -1, args.y ?? -1)
    else if (args.action === 'swipe') await swipe(args.deviceId, args.fromX ?? -1, args.fromY ?? -1, args.toX ?? -1, args.toY ?? -1, args.velocity)
    else if (args.action === 'long_press') await longPress(args.deviceId, args.x ?? -1, args.y ?? -1, args.durationMs)
    else if (args.action === 'button') await keyEvent(args.deviceId, args.key ?? '')
    else if (args.action === 'type') await inputText(args.deviceId, args.text ?? '')
    return { deviceId: args.deviceId, action: args.action, connected: true }
  },
})

export const harmonyTools: ToolDefinition[] = [devicesTool, previewStartTool, previewStopTool, previewInfoTool, screenshotTool, interactTool]
export { explainHdcError, getSession }

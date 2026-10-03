import { createHash, randomUUID } from 'node:crypto'
import { capture, listDevices } from './hdc.js'
import { HdcError } from './errors.js'

export interface HarmonyFrame {
  frameId: number
  data: Buffer
  mimeType: 'image/png'
  width?: number
  height?: number
  capturedAt: string
}

export interface HarmonySession {
  sessionId: string
  deviceId: string
  startedAt: string
  connected: boolean
  frameId: number
  frame?: HarmonyFrame
}

export type HarmonySessionView = Omit<HarmonySession, 'frame'> & { width?: number; height?: number }

const sessions = new Map<string, HarmonySession>()
const timers = new Map<string, NodeJS.Timeout>()
const polling = new Set<string>()
const frameDigests = new Map<string, string>()

function pngDimensions(data: Buffer): { width?: number; height?: number } {
  if (data.length < 24 || data.readUInt32BE(0) !== 0x89504e47) return {}
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

async function refresh(session: HarmonySession): Promise<void> {
  if (polling.has(session.sessionId) || !session.connected) return
  polling.add(session.sessionId)
  try {
    const frame = await capture(session.deviceId)
    const dimensions = pngDimensions(frame.data)
    const digest = createHash('sha1').update(frame.data).digest('hex')
    if (frameDigests.get(session.sessionId) === digest) return
    frameDigests.set(session.sessionId, digest)
    session.frameId += 1
    session.frame = { ...frame, ...dimensions, frameId: session.frameId, capturedAt: new Date().toISOString() }
  } catch {
    session.connected = false
    const timer = timers.get(session.sessionId)
    if (timer) clearInterval(timer)
    timers.delete(session.sessionId)
  } finally {
    polling.delete(session.sessionId)
  }
}

export async function resolveDevice(deviceId?: string): Promise<string> {
  const devices = await listDevices()
  if (deviceId) {
    if (!devices.some(device => device.serial === deviceId)) throw new HdcError('Requested HarmonyOS device is not connected: ' + deviceId)
    return deviceId
  }
  if (devices.length !== 1) throw new HdcError(devices.length ? 'Multiple HarmonyOS devices are connected; provide deviceId.' : 'No HarmonyOS device is connected.')
  return devices[0].serial
}

export async function startSession(deviceId?: string): Promise<HarmonySessionView> {
  const resolved = await resolveDevice(deviceId)
  const existing = [...sessions.values()].find(session => session.deviceId === resolved && session.connected)
  if (existing) return publicSession(existing)
  const session: HarmonySession = { sessionId: randomUUID(), deviceId: resolved, startedAt: new Date().toISOString(), connected: true, frameId: 0 }
  sessions.set(session.sessionId, session)
  await refresh(session)
  const timer = setInterval(() => void refresh(session), 500)
  timer.unref?.()
  timers.set(session.sessionId, timer)
  return publicSession(session)
}

export function getSession(sessionId: string): HarmonySession {
  const session = sessions.get(sessionId)
  if (!session) throw new HdcError('HarmonyOS preview session does not exist: ' + sessionId)
  return session
}

export function publicSession(session: HarmonySession): HarmonySessionView {
  return { sessionId: session.sessionId, deviceId: session.deviceId, startedAt: session.startedAt, connected: session.connected, frameId: session.frameId, width: session.frame?.width, height: session.frame?.height }
}

export function stopSession(sessionId: string): HarmonySessionView {
  const session = getSession(sessionId)
  session.connected = false
  const timer = timers.get(sessionId)
  if (timer) clearInterval(timer)
  timers.delete(sessionId)
  const result = publicSession(session)
  sessions.delete(sessionId)
  frameDigests.delete(sessionId)
  return result
}

export function listSessions(): HarmonySessionView[] {
  return [...sessions.values()].map(publicSession)
}

export async function closeAllSessions(): Promise<void> {
  for (const session of sessions.values()) stopSession(session.sessionId)
}

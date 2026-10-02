import { randomUUID } from 'node:crypto'
import { listDevices } from './hdc.js'
import { HdcError } from './errors.js'

export interface HarmonySession {
  sessionId: string
  deviceId: string
  startedAt: string
  connected: boolean
}

const sessions = new Map<string, HarmonySession>()

export async function resolveDevice(deviceId?: string): Promise<string> {
  const devices = await listDevices()
  if (deviceId) {
    if (!devices.some(device => device.serial === deviceId)) throw new HdcError('Requested HarmonyOS device is not connected: ' + deviceId)
    return deviceId
  }
  const first = devices[0]
  if (!first) throw new HdcError('No HarmonyOS device is connected.')
  return first.serial
}

export async function startSession(deviceId?: string): Promise<HarmonySession> {
  const resolved = await resolveDevice(deviceId)
  const existing = [...sessions.values()].find(session => session.deviceId === resolved && session.connected)
  if (existing) return existing
  const session: HarmonySession = {
    sessionId: randomUUID(),
    deviceId: resolved,
    startedAt: new Date().toISOString(),
    connected: true,
  }
  sessions.set(session.sessionId, session)
  return session
}

export function getSession(sessionId: string): HarmonySession {
  const session = sessions.get(sessionId)
  if (!session || !session.connected) throw new HdcError('HarmonyOS preview session is not active: ' + sessionId)
  return session
}

export function stopSession(sessionId: string): HarmonySession {
  const session = getSession(sessionId)
  session.connected = false
  return session
}

export function listSessions(): HarmonySession[] {
  return [...sessions.values()]
}

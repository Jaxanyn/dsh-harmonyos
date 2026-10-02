import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { HdcError } from './errors.js'

const execFileAsync = promisify(execFile)

export interface HarmonyDevice {
  serial: string
  state: 'online' | 'offline' | 'unknown'
}

export interface HdcOptions {
  hdc?: string
  deviceId?: string
}

async function execHdc(args: string[], options: HdcOptions = {}): Promise<{ stdout: string; stderr: string }> {
  const hdc = options.hdc ?? process.env.HDC ?? 'hdc'
  const target = options.deviceId ? ['-t', options.deviceId] : []
  try {
    return await execFileAsync(hdc, [...target, ...args], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new HdcError('HDC command failed: ' + args.join(' ') + '. ' + message, error)
  }
}

export async function listDevices(hdc?: string): Promise<HarmonyDevice[]> {
  const { stdout } = await execHdc(['list', 'targets'], { hdc })
  return stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(serial => ({
    serial,
    state: 'online' as const,
  }))
}

function assertCoordinate(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new HdcError(name + ' must be a non-negative finite number.')
}

export async function tap(deviceId: string, x: number, y: number, options: HdcOptions = {}): Promise<void> {
  assertCoordinate(x, 'x'); assertCoordinate(y, 'y')
  await execHdc(['shell', 'uitest', 'uiInput', 'click', String(Math.round(x)), String(Math.round(y))], { ...options, deviceId })
}

export async function longPress(deviceId: string, x: number, y: number, durationMs = 600, options: HdcOptions = {}): Promise<void> {
  assertCoordinate(x, 'x'); assertCoordinate(y, 'y')
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new HdcError('durationMs must be a positive finite number.')
  await execHdc(['shell', 'uitest', 'uiInput', 'longClick', String(Math.round(x)), String(Math.round(y)), String(Math.round(durationMs))], { ...options, deviceId })
}

export async function swipe(deviceId: string, fromX: number, fromY: number, toX: number, toY: number, durationMs = 400, options: HdcOptions = {}): Promise<void> {
  for (const [name, value] of [['fromX', fromX], ['fromY', fromY], ['toX', toX], ['toY', toY]] as const) assertCoordinate(value, name)
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new HdcError('durationMs must be a positive finite number.')
  await execHdc(['shell', 'uitest', 'uiInput', 'swipe', String(Math.round(fromX)), String(Math.round(fromY)), String(Math.round(toX)), String(Math.round(toY)), String(Math.round(durationMs))], { ...options, deviceId })
}

export async function keyEvent(deviceId: string, key: string, options: HdcOptions = {}): Promise<void> {
  if (!/^[A-Za-z0-9_]+$/.test(key)) throw new HdcError('key must contain only letters, numbers, and underscores.')
  await execHdc(['shell', 'uitest', 'uiInput', 'keyEvent', key], { ...options, deviceId })
}

export async function inputText(deviceId: string, text: string, options: HdcOptions = {}): Promise<void> {
  if (!text || text.length > 4096) throw new HdcError('text must contain 1 to 4096 characters.')
  await execHdc(['shell', 'uitest', 'uiInput', 'text', text], { ...options, deviceId })
}

export async function capture(deviceId: string, options: HdcOptions = {}): Promise<{ mimeType: 'image/png'; data: Buffer }> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-harmonyos-'))
  const localPath = join(directory, 'screen.png')
  const remotePath = '/data/local/tmp/dsh-harmonyos-' + Date.now() + '.png'
  try {
    await execHdc(['shell', 'uitest', 'screenCap', '-p', remotePath], { ...options, deviceId })
    await execHdc(['file', 'recv', remotePath, localPath], { ...options, deviceId })
    return { mimeType: 'image/png', data: await readFile(localPath) }
  } finally {
    await execHdc(['shell', 'rm', remotePath], { ...options, deviceId }).catch(() => undefined)
    await rm(directory, { recursive: true, force: true })
  }
}

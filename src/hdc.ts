import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { crc32 } from 'node:zlib'
import { HdcError } from './errors.js'

const execFileAsync = promisify(execFile)
const deviceLocks = new Map<string, Promise<void>>()

export interface HarmonyDevice {
  serial: string
  state: 'online' | 'offline' | 'unknown'
}

export interface HdcOptions {
  hdc?: string
  deviceId?: string
  timeoutMs?: number
  maxBuffer?: number
  signal?: AbortSignal
  /** Test seam; defaults to Node execFile, never a local shell. */
  executor?: (file: string, args: string[], options: {
    windowsHide: boolean; encoding: 'utf8'; timeout: number; maxBuffer: number; signal?: AbortSignal
  }) => Promise<{ stdout: string; stderr: string }>
}

function assertDevice(deviceId: string): void {
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,255}$/.test(deviceId)) {
    throw new HdcError('An explicit valid HDC deviceId is required.')
  }
}

// HDC joins shell arguments for the DEVICE shell. execFile only protects the host shell.
export function quoteShellArgument(value: string): string {
  if (value.includes('\0')) throw new HdcError('Shell arguments must not contain NUL.')
  return "'" + value.replaceAll("'", "'\"'\"'") + "'"
}

async function execHdc(args: string[], options: HdcOptions = {}): Promise<{ stdout: string; stderr: string }> {
  const timeout = options.timeoutMs ?? 15000
  const maxBuffer = options.maxBuffer ?? 1024 * 1024
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000) throw new HdcError('timeoutMs must be an integer from 1 to 120000.')
  if (!Number.isInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > 8 * 1024 * 1024) throw new HdcError('maxBuffer must be an integer from 1 to 8388608.')
  if (options.deviceId !== undefined) assertDevice(options.deviceId)
  const target = options.deviceId === undefined ? [] : ['-t', options.deviceId]
  const lockKey = (options.hdc ?? process.env.HDC ?? 'hdc') + ':' + (options.deviceId ?? '*')
  const previous = deviceLocks.get(lockKey) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve })
  deviceLocks.set(lockKey, current)
  await previous
  try {
    options.signal?.throwIfAborted()
    const result = await (options.executor ?? execFileAsync)(options.hdc ?? process.env.HDC ?? 'hdc', [...target, ...args], {
      windowsHide: true, encoding: 'utf8', timeout, maxBuffer, signal: options.signal,
    })
    // HDC/uitest can return exit 0 for connection, argument and injection failures.
    if (/missing parameter|not supported|unknown command/i.test(result.stdout + '\n' + result.stderr)) throw new HdcError('HDC reported a command failure: ' + (result.stderr || result.stdout).trim().slice(0, 1000))
    const diagnostics = (result.stdout + '\n' + result.stderr).replace(/\bno\s+error\b/gi, '')
    if (/(?:\b(?:error|failed|failure|unsupported|invalid|missing parameter|not found|not supported|permission denied|no permissions|not connected|no devices?|device offline|unknown command)\b|\[Fail\]|^\s*usage\s*:)/im.test(diagnostics)) {
      throw new HdcError('HDC reported a command failure: ' + (result.stderr || result.stdout).trim().slice(0, 1000))
    }
    return result
  } catch (error) {
    if (error instanceof HdcError) throw error
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') throw new HdcError('HDC executable was not found. Set HDC or add hdc to PATH.', error)
    if (options.signal?.aborted) throw new HdcError('HDC command was cancelled.', error)
    // Do not include execFile's message: it includes the command and potentially private input text.
    throw new HdcError('HDC command failed (process exit, timeout, or output limit).', error)
  } finally {
    release()
    if (deviceLocks.get(lockKey) === current) deviceLocks.delete(lockKey)
  }
}

async function shell(deviceId: string, args: string[], options: HdcOptions): Promise<void> {
  assertDevice(deviceId)
  await execHdc(['shell', args.map(quoteShellArgument).join(' ')], { ...options, deviceId })
}

export async function listDevices(hdcOrOptions?: string | HdcOptions): Promise<HarmonyDevice[]> {
  const options = typeof hdcOrOptions === 'string' ? { hdc: hdcOrOptions } : hdcOrOptions
  const { stdout } = await execHdc(['list', 'targets'], options)
  const serials = stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line && line !== '[Empty]')
  for (const serial of serials) assertDevice(serial)
  return [...new Set(serials)].map(serial => ({ serial, state: 'online' }))
}

function assertCoordinate(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 2147483647) throw new HdcError(name + ' must be a non-negative finite pixel coordinate <= 2147483647.')
}

export async function tap(deviceId: string, x: number, y: number, options: HdcOptions = {}): Promise<void> {
  assertCoordinate(x, 'x'); assertCoordinate(y, 'y')
  await shell(deviceId, ['uitest', 'uiInput', 'click', String(Math.round(x)), String(Math.round(y))], options)
}

// Live uitest help: longClick <x> <y> [displayId]. No duration argument exists.
export async function longPress(deviceId: string, x: number, y: number, durationMs?: number, options: HdcOptions = {}): Promise<void> {
  assertCoordinate(x, 'x'); assertCoordinate(y, 'y')
  if (durationMs !== undefined) throw new HdcError('Custom long-press duration is not supported by uitest longClick.')
  await shell(deviceId, ['uitest', 'uiInput', 'longClick', String(Math.round(x)), String(Math.round(y))], options)
}

// The final argument is velocity (pixels/second), NOT duration in milliseconds.
export async function swipe(deviceId: string, fromX: number, fromY: number, toX: number, toY: number, velocity: number | undefined = 600, options: HdcOptions = {}): Promise<void> {
  for (const [name, value] of [['fromX', fromX], ['fromY', fromY], ['toX', toX], ['toY', toY]] as const) assertCoordinate(value, name)
  const actualVelocity = velocity ?? 600
  if (!Number.isInteger(actualVelocity) || actualVelocity < 200 || actualVelocity > 40000) throw new HdcError('velocity must be an integer from 200 to 40000 pixels/second.')
  await shell(deviceId, ['uitest', 'uiInput', 'swipe', ...[fromX, fromY, toX, toY].map(value => String(Math.round(value))), String(actualVelocity)], options)
}

export async function keyEvent(deviceId: string, key: string, options: HdcOptions = {}): Promise<void> {
  if (typeof key !== 'string' || !(/^(Back|Home|Power)$/.test(key) || (/^\d{1,10}$/.test(key) && Number(key) <= 2147483647))) {
    throw new HdcError('key must be a numeric HarmonyOS key ID or Back, Home, Power (case-sensitive).')
  }
  await shell(deviceId, ['uitest', 'uiInput', 'keyEvent', key], options)
}

export async function inputText(deviceId: string, text: string, options: HdcOptions = {}): Promise<void> {
  if (typeof text !== 'string' || !text || text.length > 4096 || /[\x00-\x1f\x7f]/.test(text)) throw new HdcError('text must contain 1 to 4096 characters without control characters.')
  await shell(deviceId, ['uitest', 'uiInput', 'text', text], options)
}

export function pngDimensions(data: Buffer): { width: number; height: number } {
  const invalid = () => new HdcError('HDC screenshot is not a valid bounded PNG.')
  if (data.length < 45 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw invalid()
  let width = 0, height = 0, hasData = false
  for (let offset = 8; offset + 12 <= data.length;) {
    const length = data.readUInt32BE(offset)
    const end = offset + 12 + length
    if (end > data.length) throw invalid()
    const type = data.toString('ascii', offset + 4, offset + 8)
    if (crc32(data.subarray(offset + 4, end - 4)) !== data.readUInt32BE(end - 4)) throw invalid()
    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) throw invalid()
      width = data.readUInt32BE(offset + 8); height = data.readUInt32BE(offset + 12)
      if (!width || !height || width > 32768 || height > 32768 || width * height > 100000000) throw invalid()
    } else if (type === 'IHDR') throw invalid()
    if (type === 'IDAT' && length > 0) hasData = true
    if (type === 'IEND') {
      if (length !== 0 || end !== data.length || !hasData) throw invalid()
      return { width, height }
    }
    offset = end
  }
  throw invalid()
}

export async function installPackage(deviceId: string, hapPath: string, options: HdcOptions = {}): Promise<void> {
  assertDevice(deviceId)
  if (!hapPath.toLowerCase().endsWith('.hap')) throw new HdcError('Only .hap artifacts can be installed.')
  await execHdc(['install', '-r', hapPath], { ...options, deviceId })
}

export async function startAbility(deviceId: string, bundleName: string, abilityName: string, options: HdcOptions = {}): Promise<void> {
  assertDevice(deviceId)
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(bundleName) || !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(abilityName)) throw new HdcError('bundleName and abilityName must be valid HarmonyOS identifiers.')
  await shell(deviceId, ['aa', 'start', '-b', bundleName, '-a', abilityName], options)
}

export async function capture(deviceId: string, options: HdcOptions = {}): Promise<{ mimeType: 'image/png'; data: Buffer; width: number; height: number }> {
  assertDevice(deviceId)
  options.signal?.throwIfAborted()
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const remotePath = '/data/local/tmp/dsh-harmonyos-' + randomUUID() + '.png'
    try {
      const command = 'uitest screenCap -p ' + quoteShellArgument(remotePath) + '; base64 ' + quoteShellArgument(remotePath)
      const result = await execHdc(['shell', command], { ...options, deviceId, maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024 })
      const encodedStart = result.stdout.indexOf('iVBORw0KGgo')
      if (encodedStart < 0) throw new HdcError('HDC screenshot did not return a PNG.')
      const data = Buffer.from(result.stdout.slice(encodedStart).replace(/\s/g, ''), 'base64')
      if (data.length > 32 * 1024 * 1024) throw new HdcError('HDC screenshot exceeds 32 MiB.')
      return { mimeType: 'image/png', data, ...pngDimensions(data) }
    } catch (error) {
      lastError = error
      const retryable = error instanceof HdcError && /valid bounded PNG|did not return a PNG|screenCap|display pixelMap|temporarily unavailable|busy/i.test(error.message)
      if (!retryable || attempt === 2) throw error
    } finally {
      // Delay cleanup so a control command can acquire the device lock first.
      const cleanup = setTimeout(() => { void shell(deviceId, ['rm', '-f', remotePath], { ...options, signal: undefined, timeoutMs: 3000 }).catch(() => undefined) }, 250)
      cleanup.unref?.()
    }
  }
  throw lastError instanceof Error ? lastError : new HdcError('HDC screenshot failed.')
}

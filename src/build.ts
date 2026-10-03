import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { HdcError } from './errors.js'
import { installPackage, startAbility, type HdcOptions } from './hdc.js'

const execFileAsync = promisify(execFile)
const ID = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/
const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,255}$/
const MODULE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/
const TAIL = 4000

type Runner = (file: string, args: string[], options: { cwd: string; timeout: number; signal?: AbortSignal }) => Promise<{ stdout: string; stderr: string }>

export interface BuildRunOptions {
  projectPath: string
  deviceId: string
  bundleName: string
  abilityName: string
  module?: string
  product?: string
  target?: string
  buildMode?: 'debug' | 'release'
  hapPath?: string
  timeoutMs?: number
  signal?: AbortSignal
  runner?: Runner
  install?: typeof installPackage
  launch?: typeof startAbility
}

export interface BuildRunResult {
  projectPath: string
  hapPath: string
  bundleName: string
  abilityName: string
  deviceId: string
  built: boolean
  installed: true
  started: true
}

async function isFile(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile() } catch { return false }
}

async function findHvigor(projectPath: string): Promise<string> {
  const candidates = [
    join(projectPath, 'hvigorw.js'),
    process.env.HVIGOR,
    process.env.DEVECO_HOME && join(process.env.DEVECO_HOME, 'tools', 'hvigor', 'bin', 'hvigorw.js'),
    process.env.DEVECO_SDK_HOME && join(resolve(process.env.DEVECO_SDK_HOME, '..'), 'tools', 'hvigor', 'bin', 'hvigorw.js'),
    ...(process.env.PATH ?? '').split(';').filter(Boolean).map(dir => join(dir, 'hvigorw.js')),
  ].filter((path): path is string => Boolean(path))
  for (const path of [...new Set(candidates)]) if (await isFile(path)) return resolve(path)
  throw new HdcError('No Node hvigor entry found. Set HVIGOR or install DevEco hvigor; Windows .bat wrappers are not executed directly.')
}

async function findHaps(root: string): Promise<string[]> {
  const found: string[] = []
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.hap')) found.push(path)
    }
  }
  await walk(root)
  return found
}

function bounded(text: unknown): string {
  const value = String(text ?? '').trim()
  return value.length > TAIL ? value.slice(-TAIL) : value
}

function checked(value: string | undefined, name: string): string | undefined {
  if (value !== undefined && !MODULE.test(value)) throw new HdcError(name + ' contains invalid characters.')
  return value
}

function withinProject(projectPath: string, path: string): boolean {
  const rel = relative(projectPath, path)
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + requireSeparator()) && !isAbsolute(rel)
}
function requireSeparator(): string { return process.platform === 'win32' ? '\\' : '/' }

const defaultRunner: Runner = async (file, args, options) => execFileAsync(process.execPath, [file, ...args], {
  cwd: options.cwd, windowsHide: true, encoding: 'utf8', timeout: options.timeout, maxBuffer: 4 * 1024 * 1024, signal: options.signal,
})

export async function buildAndRun(options: BuildRunOptions): Promise<BuildRunResult> {
  const projectPath = resolve(options.projectPath)
  if (!(await isFile(join(projectPath, 'build-profile.json5')))) throw new HdcError('A Stage project build-profile.json5 is required: ' + projectPath)
  if (!options.deviceId || !DEVICE_ID.test(options.deviceId)) throw new HdcError('An explicit valid HDC deviceId is required.')
  if (!ID.test(options.bundleName) || !ID.test(options.abilityName)) throw new HdcError('bundleName and abilityName must be valid HarmonyOS identifiers.')
  const timeout = options.timeoutMs ?? 300000
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 1800000) throw new HdcError('timeoutMs must be an integer from 1 to 1800000.')
  const module = checked(options.module, 'module')
  const product = checked(options.product, 'product')
  const target = checked(options.target, 'target')
  const buildMode = options.buildMode ?? 'debug'
  if (!module || !product || !target) throw new HdcError('module, product, and target are required; refusing to guess project identifiers.')
  if (buildMode !== 'debug' && buildMode !== 'release') throw new HdcError('buildMode must be debug or release.')
  options.signal?.throwIfAborted()

  let hapPath: string
  let built = true
  if (options.hapPath !== undefined) {
    hapPath = resolve(options.hapPath)
    if (!hapPath.toLowerCase().endsWith('.hap') || !/signed/i.test(basename(hapPath)) || !withinProject(projectPath, hapPath) || !(await isFile(hapPath))) throw new HdcError('hapPath must be an existing signed .hap file inside projectPath.')
    built = false
  } else {
    const before = new Map((await findHaps(projectPath)).map(path => [resolve(path), 0]))
    for (const path of before.keys()) before.set(path, (await stat(path)).mtimeMs)
    const started = Date.now()
    const hvigor = await findHvigor(projectPath)
    const args = [
      'assembleHap', '--mode', 'module', '-p', 'product=' + product,
      '-p', 'module=' + module + '@' + target, '-p', 'buildMode=' + buildMode,
    ]
    try { await (options.runner ?? defaultRunner)(hvigor, args, { cwd: projectPath, timeout, signal: options.signal }) }
    catch (error) {
      if (options.signal?.aborted) throw new HdcError('HarmonyOS build was cancelled.', error)
      const e = error as { stdout?: string; stderr?: string }
      const log = [bounded(e.stdout), bounded(e.stderr)].filter(Boolean).join('\n')
      throw new HdcError('HarmonyOS build failed.' + (log ? ' Output tail:\n' + log : ''), error)
    }
    options.signal?.throwIfAborted()
    const fresh = []
    for (const path of await findHaps(projectPath)) {
      const info = await stat(path)
      if (info.size > 0 && /signed/i.test(basename(path)) && (info.mtimeMs >= started || !before.has(resolve(path)))) fresh.push(resolve(path))
    }
    if (fresh.length !== 1) throw new HdcError(fresh.length === 0 ? 'Build completed but produced no fresh signed .hap artifact.' : 'Build produced multiple fresh .hap artifacts; specify hapPath instead.')
    hapPath = fresh[0]
  }
  options.signal?.throwIfAborted()
  // ponytail: HDC rejects timeouts above 120s; keep the longer budget for hvigor only.
  const hdc: HdcOptions = { timeoutMs: Math.min(timeout, 120000), signal: options.signal }
  try {
    await (options.install ?? installPackage)(options.deviceId, hapPath, hdc)
    await (options.launch ?? startAbility)(options.deviceId, options.bundleName, options.abilityName, hdc)
  } catch (error) { throw new HdcError('HarmonyOS artifact was built but install or launch failed.', error) }
  return { projectPath, hapPath, bundleName: options.bundleName, abilityName: options.abilityName, deviceId: options.deviceId, built, installed: true, started: true }
}

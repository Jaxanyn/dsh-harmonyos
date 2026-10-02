import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface HarmonyDevice {
  serial: string
  state: 'online' | 'offline' | 'unknown'
}

export async function listDevices(hdc = process.env.HDC ?? 'hdc'): Promise<HarmonyDevice[]> {
  const { stdout } = await execFileAsync(hdc, ['list', 'targets'], { windowsHide: true })
  return stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(serial => ({
    serial,
    state: 'online' as const,
  }))
}

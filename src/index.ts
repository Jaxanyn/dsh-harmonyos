import type { Context } from '@deepseek-ai/cordis'
import type ToolRegistry from '@deepseek-ai/dsh-tools'
import { harmonyTools } from './tools.js'
import { installHarmonyRoutes } from './routes.js'
import { closeAllSessions } from './session.js'

export { capture, inputText, installPackage, keyEvent, listApps, listDevices, longPress, startAbility, swipe, tap } from './hdc.js'
export { previewRefreshDelayMs } from './session.js'
export { buildAndRun } from './build.js'
export { harmonyTools } from './tools.js'
export { installHarmonyRoutes } from './routes.js'

export const inject = ['tools', 'webServer']

type HostContext = Context & { tools: ToolRegistry; webServer: Parameters<typeof installHarmonyRoutes>[0]['webServer'] }

export function apply(ctx: Context): () => void {
  const host = ctx as HostContext
  const disposers = harmonyTools.map(tool => host.tools.register(tool))
  const disposeRoutes = installHarmonyRoutes(host)
  return () => {
    disposers.forEach(dispose => dispose())
    disposeRoutes()
    void closeAllSessions()
  }
}

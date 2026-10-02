import type { Context } from '@deepseek-ai/cordis'
import type ToolRegistry from '@deepseek-ai/dsh-tools'
import { harmonyTools } from './tools.js'

export { listDevices } from './hdc.js'

export const inject = ['tools']

type HostContext = Context & { tools: ToolRegistry }

export function apply(ctx: Context): () => void {
  const host = ctx as HostContext
  const disposers = harmonyTools.map(tool => host.tools.register(tool))
  return () => disposers.forEach(dispose => dispose())
}

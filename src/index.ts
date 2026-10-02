import type { Context } from '@deepseek-ai/cordis'
import type ToolRegistry from '@deepseek-ai/dsh-tools'
import { harmonyTools } from './tools.js'

export { capture, inputText, keyEvent, listDevices, longPress, swipe, tap } from './hdc.js'
export { harmonyTools } from './tools.js'

export const inject = ['tools']

type HostContext = Context & { tools: ToolRegistry }

export function apply(ctx: Context): () => void {
  const host = ctx as HostContext
  const disposers = harmonyTools.map(tool => host.tools.register(tool))
  return () => disposers.forEach(dispose => dispose())
}

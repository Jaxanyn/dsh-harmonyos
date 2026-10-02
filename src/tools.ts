import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { listDevices } from './hdc.js'

const devicesTool = defineTool({
  name: 'harmony_devices',
  description: 'List connected pure HarmonyOS devices available through HDC.',
  parameters: {},
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        devices: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              serial: { type: 'string' },
              state: { type: 'string' },
            },
          },
        },
      },
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  },
  async execute() {
    return { devices: await listDevices() }
  },
})

export const harmonyTools: ToolDefinition[] = [devicesTool]

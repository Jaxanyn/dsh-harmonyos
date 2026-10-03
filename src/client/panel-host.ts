import { createRoot, type Root } from 'react-dom/client'

export type HarmonyPanelHost = {
  root: Root
  dispose: () => void
}

export function mountHarmonyPanelHost(id = 'dsh-harmonyos-panel-host'): HarmonyPanelHost {
  const node = document.createElement('div')
  node.id = id
  document.body.append(node)
  const root = createRoot(node)
  return {
    root,
    dispose: () => {
      root.unmount()
      node.remove()
    },
  }
}

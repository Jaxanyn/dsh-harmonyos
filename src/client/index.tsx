import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { mountHarmonyPanelHost, type HarmonyPanelHost } from './panel-host.js'
import { deviceCoordinate, fitFrame, panelWidth } from './preview-geometry.js'

export type Coordinate = { x: number; y: number }
export function normalizeCoordinate(point: Coordinate, width: number, height: number): Coordinate {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('invalid frame size')
  return { x: Math.min(1, Math.max(0, point.x / width)), y: Math.min(1, Math.max(0, point.y / height)) }
}
export type Session = { sessionId: string; deviceId: string; connected: boolean; startedAt?: string; state?: string; frameId?: number; width?: number; height?: number }
type Frame = { url: string; id: number; width: number; height: number }
type Controller = { session?: Session; token?: string; expiresAt?: number; frame?: Frame; viewRotation: 0 | 90; visible: boolean; busy: boolean; error?: string; disposed: boolean; version: number; listeners: Set<() => void> }
const API = '/_dsh/dsh-harmonyos'; const controllers = new Map<string, Controller>(); const root: Controller = { visible: false, busy: false, viewRotation: 0, disposed: false, version: 0, listeners: new Set() }; let active: Controller | undefined; let panelHost: HarmonyPanelHost | undefined
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(API + path, init); if (!response.ok) throw new Error((await response.text()).slice(0, 300) || response.statusText); return await response.json() as T }
function emit(controller: Controller): void { if (controller.disposed) return; controller.version += 1; controller.listeners.forEach(listener => listener()) }
function useController(controller: Controller): Controller { useSyncExternalStore(listener => { controller.listeners.add(listener); return () => controller.listeners.delete(listener) }, () => controller.version, () => controller.version); return controller }
function controllerFor(sessionId?: string): Controller { if (!sessionId) return root; let controller = controllers.get(sessionId); if (!controller) { controller = { visible: false, busy: false, viewRotation: 0, disposed: false, version: 0, listeners: new Set() }; controllers.set(sessionId, controller) } return controller }
function revokeFrame(controller: Controller): void { if (controller.frame) URL.revokeObjectURL(controller.frame.url); controller.frame = undefined }
async function grant(controller: Controller): Promise<void> { if (!controller.session) return; if (!controller.token || !controller.expiresAt || controller.expiresAt - Date.now() < 10000) { const result = await request<{ token: string; expiresAt: number }>('/grant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: controller.session.sessionId }) }); controller.token = result.token; controller.expiresAt = result.expiresAt } }
async function refresh(controller: Controller): Promise<void> { if (!controller.session || controller.busy || controller.disposed) return; controller.busy = true; try { await grant(controller); const session = await request<Session>('/status?sessionId=' + encodeURIComponent(controller.session.sessionId), { headers: { authorization: 'Bearer ' + controller.token } }); controller.session = session; if (!session.connected || session.state === 'stopped' || session.state === 'disconnected') { revokeFrame(controller); emit(controller); return }; if (controller.frame && session.frameId === controller.frame.id) return; const response = await fetch(API + '/frame?sessionId=' + encodeURIComponent(session.sessionId), { headers: { authorization: 'Bearer ' + controller.token } }); if (response.status === 204) { controller.error = undefined; emit(controller); return }; if (!response.ok) throw new Error('failed to read frame'); const url = URL.createObjectURL(await response.blob()); const frame = { url, id: Number(response.headers.get('x-frame-id')), width: Number(response.headers.get('x-frame-width')), height: Number(response.headers.get('x-frame-height')) }; if (!Number.isSafeInteger(frame.id) || frame.width <= 0 || frame.height <= 0) { URL.revokeObjectURL(url); throw new Error('invalid frame metadata') }; await new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error('failed to decode frame')); image.src = url }); revokeFrame(controller); controller.frame = frame; controller.session = { ...session, frameId: frame.id, width: frame.width, height: frame.height }; controller.error = undefined; emit(controller) } catch (error) { controller.error = error instanceof Error ? error.message : String(error); if (controller.session) controller.session = { ...controller.session, connected: false, state: 'disconnected' }; emit(controller) } finally { controller.busy = false } }
function ensurePortal(): void { if (panelHost) return; panelHost = mountHarmonyPanelHost(); panelHost.root.render(<Portal />) }
function activate(controller: Controller): void { active = controller; controller.visible = true; emit(controller); emit(root) }
function seedSession(controller: Controller, session?: Session): void { if (!session) return; if (!controller.session || controller.session.sessionId !== session.sessionId || !controller.session.connected) { controller.session = session; controllers.set(session.sessionId, controller); controller.error = undefined } }
function open(controller: Controller): void { activate(controller); ensurePortal(); void refresh(controller) }
function openWithSession(controller: Controller, session?: Session): void { seedSession(controller, session); open(controller) }
async function stop(controller: Controller): Promise<void> { if (!controller.session) return; controller.busy = true; try { await grant(controller); controller.session = await request<Session>('/stop', { method: 'POST', headers: { authorization: 'Bearer ' + controller.token, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: controller.session.sessionId }) }); controller.error = undefined } catch (error) { controller.error = error instanceof Error ? error.message : String(error) } finally { revokeFrame(controller); controller.busy = false; if (controller.session) controller.session = { ...controller.session, connected: false, state: 'stopped' }; emit(controller) } }
function useLayoutLease(visible: boolean, width: number): void {
  useEffect(() => {
    if (!visible || window.innerWidth <= 760) return
    const host = document.querySelector<HTMLElement>('#app, #root, [data-dsh-root]')
    if (!host) return
    const previous = { marginRight: host.style.marginRight, width: host.style.width }
    const margin = Number.parseFloat(getComputedStyle(host).marginRight) || 0
    host.style.marginRight = String(margin + width) + 'px'
    host.style.width = 'calc(100% - ' + (margin + width) + 'px)'
    return () => { host.style.marginRight = previous.marginRight; host.style.width = previous.width }
  }, [visible, width])
}
function Portal(): React.ReactElement | null {
  useController(root)
  const controller = active
  const [viewport, setViewport] = useState(() => window.innerWidth)
  const [preferredWidth, setPreferredWidth] = useState(440)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const width = panelWidth(preferredWidth, viewport)
  useLayoutLease(Boolean(controller?.visible) && !expanded, width)
  return controller?.visible ? <Panel controller={controller} width={width} expanded={expanded} onExpand={() => setExpanded(value => !value)} onResize={setPreferredWidth} /> : null
}
function usePolling(controller: Controller): void { const visible = useController(controller).visible; useEffect(() => { if (!visible || !controller.session) return; let stopped = false; const tick = () => { if (!stopped && document.visibilityState !== 'hidden') void refresh(controller) }; const onVisibility = () => { if (document.visibilityState === 'visible') tick() }; tick(); const timer = window.setInterval(tick, 700); document.addEventListener('visibilitychange', onVisibility); return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) } }, [controller, visible, controller.session?.sessionId]) }
function control(controller: Controller, body: Record<string, unknown>): void { const session = controller.session; if (!session?.connected || session.frameId === undefined || !controller.token || controller.busy) return; controller.busy = true; void request<Session>('/control', { method: 'POST', headers: { authorization: 'Bearer ' + controller.token, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: session.sessionId, frameId: session.frameId, ...body }) }).then(next => { controller.session = next; controller.error = undefined }).catch(error => { controller.error = error instanceof Error ? error.message : String(error) }).finally(() => { controller.busy = false; emit(controller) }) }
function Frame({ controller }: { controller: Controller }): React.ReactElement {
  const canvas = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const down = useRef<{ point: Coordinate; time: number }>()
  const timer = useRef<number>()
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const measure = () => setSize({ width: Math.max(0, element.clientWidth - 24), height: Math.max(0, element.clientHeight - 24) })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => { observer.disconnect(); window.clearTimeout(timer.current) }
  }, [])
  const frame = controller.frame
  const layout = fitFrame(frame?.width ?? 0, frame?.height ?? 0, size.width, size.height, controller.viewRotation)
  const pointOf = (event: React.PointerEvent<HTMLImageElement>) => {
    const rect = image.current!.getBoundingClientRect()
    const point = normalizeCoordinate({ x: event.clientX - rect.left, y: event.clientY - rect.top }, rect.width, rect.height)
    return deviceCoordinate(point.x, point.y, controller.viewRotation)
  }
  const cancel = () => { window.clearTimeout(timer.current); down.current = undefined }
  return <div ref={canvas} className="dsh-hm-screen">
    {controller.frame ? <div className="dsh-hm-frame-shell" style={{ width: layout.shellWidth, height: layout.shellHeight }}>
      <img ref={image} src={controller.frame.url} className="dsh-hm-frame" style={{ width: layout.width, height: layout.height, transform: 'translate(-50%, -50%) rotate(' + controller.viewRotation + 'deg)' }} alt="HarmonyOS device screen" draggable={false}
        onPointerDown={event => {
          if (!controller.session?.connected || controller.busy) return
          event.currentTarget.setPointerCapture(event.pointerId)
          const point = pointOf(event)
          down.current = { point, time: Date.now() }
          timer.current = window.setTimeout(() => { if (down.current) { control(controller, { action: 'long_press', x: point.x, y: point.y }); down.current = undefined } }, 500)
        }}
        onPointerMove={event => { if (down.current) { const point = pointOf(event); if (Math.hypot(point.x - down.current.point.x, point.y - down.current.point.y) > .02) window.clearTimeout(timer.current) } }}
        onPointerUp={event => {
          if (!down.current) return
          window.clearTimeout(timer.current)
          const start = down.current
          const end = pointOf(event)
          down.current = undefined
          const elapsed = Math.max(1, Date.now() - start.time)
          if (Math.hypot(end.x - start.point.x, end.y - start.point.y) > .02) control(controller, { action: 'swipe', fromX: start.point.x, fromY: start.point.y, toX: end.x, toY: end.y, velocity: Math.max(200, Math.min(40000, Math.round(500000 / elapsed))) })
          else if (elapsed < 500) control(controller, { action: 'tap', x: end.x, y: end.y })
        }} onPointerCancel={cancel} onLostPointerCapture={cancel} />
    </div> : <div className="dsh-hm-loading" role="status"><Icon name="device" /><span>正在读取设备画面…</span></div>}
  </div>
}
function saveFrame(controller: Controller): void { if (!controller.frame) return; const link = document.createElement('a'); link.href = controller.frame.url; link.download = 'harmonyos-' + (controller.session?.deviceId ?? 'screen') + '-' + controller.frame.id + '.png'; link.click() }
type IconName = 'device' | 'close' | 'expand' | 'collapse' | 'refresh' | 'camera' | 'rotate' | 'back' | 'home' | 'recent' | 'stop' | 'send'
function Icon({ name }: { name: IconName }): React.ReactElement {
  const paths: Record<IconName, string> = {
    device: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM10 18h4',
    close: 'm6 6 12 12M6 18 18 6', expand: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
    collapse: 'M3 8h5V3M21 8h-5V3M8 21v-5H3M16 21v-5h5',
    refresh: 'M20 7v5h-5M4 17v-5h5M5.5 7a7.5 7.5 0 0 1 12-2L20 8M4 16l2.5 3a7.5 7.5 0 0 0 12-2',
    camera: 'M8 5l2-2h4l2 2h4v15H4V5h4ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    rotate: 'M20 7v5h-5M6 7a7 7 0 0 1 12-2l2 3M5 10h7v11H5V10Z',
    back: 'm14 5-7 7 7 7', home: 'M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    recent: 'M5 5h14v14H5V5Z', stop: 'M8 4v7M16 4v7M5 10h14v3a7 7 0 0 1-7 7v3M5 13a7 7 0 0 0 7 7',
    send: 'm4 12 16-8-6 16-2-8-8 0ZM12 12l8-8',
  }
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
function Panel({ controller, embedded = false, width = 440, expanded = false, onExpand, onResize }: { controller: Controller; embedded?: boolean; width?: number; expanded?: boolean; onExpand?: () => void; onResize?: (width: number) => void }): React.ReactElement | null {
  const state = useController(controller)
  usePolling(controller)
  const [devices, setDevices] = useState<{ serial: string; state: string }[]>([])
  const [selected, setSelected] = useState('')
  const [text, setText] = useState('')
  const drag = useRef<{ x: number; width: number }>()
  const session = state.session
  useEffect(() => {
    if (!state.visible || session?.connected) return
    let disposed = false
    void request<{ devices: { serial: string; state: string }[] }>('/devices').then(result => {
      if (disposed) return
      setDevices(result.devices)
      const connected = result.devices.filter(device => device.state === 'online' || device.state === 'Connected')
      if (connected.length === 1) setSelected(connected[0].serial)
    }).catch(error => { if (!disposed) { controller.error = error instanceof Error ? error.message : String(error); emit(controller) } })
    return () => { disposed = true }
  }, [controller, state.visible, session?.sessionId, session?.connected])
  const close = () => { controller.visible = false; emit(controller); emit(root) }
  useEffect(() => {
    if (embedded || !state.visible) return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (expanded || (event.target instanceof Element && Boolean(event.target.closest('.dsh-hm-panel'))))) close()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [controller, embedded, expanded, state.visible])
  if (!state.visible) return null
  const disabled = !session?.connected || state.busy
  const start = () => {
    controller.busy = true
    controller.error = undefined
    emit(controller)
    void request<Session>('/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: selected }) }).then(next => {
      revokeFrame(controller)
      controller.token = undefined
      controller.expiresAt = undefined
      controller.session = next
      controllers.set(next.sessionId, controller)
      open(controller)
    }).catch(error => { controller.error = error instanceof Error ? error.message : String(error) }).finally(() => { controller.busy = false; emit(controller); void refresh(controller) })
  }
  const connected = session?.connected && session.state !== 'stopped' && session.state !== 'disconnected'
  const status = connected ? '已连接' : session?.state === 'stopped' ? '已停止' : '未连接'
  return <aside className={'dsh-hm-panel' + (embedded ? ' dsh-hm-details-panel' : '') + (expanded ? ' is-expanded' : '')} style={embedded || expanded ? undefined : { width }} role="complementary" aria-label="HarmonyOS preview">
    {!embedded && !expanded && <div className="dsh-hm-resize" role="separator" tabIndex={0} aria-label="Resize preview panel" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={panelWidth(960, window.innerWidth)} aria-valuenow={width}
      onPointerDown={event => { drag.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
      onPointerMove={event => { if (drag.current) onResize?.(panelWidth(drag.current.width + drag.current.x - event.clientX, window.innerWidth)) }}
      onPointerUp={() => { drag.current = undefined }} onPointerCancel={() => { drag.current = undefined }} onLostPointerCapture={() => { drag.current = undefined }}
      onDoubleClick={() => onResize?.(440)}
      onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) { event.preventDefault(); onResize?.(event.key === 'Home' ? 440 : panelWidth(width + (event.key === 'ArrowLeft' ? 24 : -24), window.innerWidth)) } }}><span /></div>}
    <header className="dsh-hm-header">
      <div className="dsh-hm-brand"><Icon name="device" /></div>
      <div className="dsh-hm-title-cluster"><strong>HarmonyOS</strong><span className="dsh-hm-device-label" title={session?.deviceId}>{session?.deviceId ?? '设备预览'}</span></div>
      <span className="dsh-hm-status" role="status"><span className={'dsh-hm-status-dot' + (connected ? ' is-live' : '')} />{status}</span>
      {onExpand && <button className="dsh-hm-icon-button" onClick={onExpand} aria-label={expanded ? 'Restore sidebar' : 'Expand preview'} title={expanded ? '返回侧栏' : '放大预览'}><Icon name={expanded ? 'collapse' : 'expand'} /></button>}
      <button className="dsh-hm-icon-button" onClick={close} aria-label="Close preview" title="关闭预览"><Icon name="close" /></button>
    </header>
    {!connected ? <section className="dsh-hm-empty">
      <div className="dsh-hm-empty-device"><Icon name="device" /></div><strong>连接鸿蒙设备</strong><p>选择已连接的设备，开始查看和操作画面。</p>
      <label>Select device<select aria-label="Select device" value={selected} onChange={event => setSelected(event.target.value)}><option value="">选择设备</option>{devices.map(device => <option key={device.serial} value={device.serial}>{device.serial} · {device.state}</option>)}</select></label>
      <button className="dsh-hm-primary" disabled={!selected || state.busy} onClick={start} aria-label="Start preview">{state.busy ? '正在连接…' : '开始预览'}</button>
      {!devices.length && <small>请确认设备已通过 HDC 连接。</small>}
    </section> : <>
      <div className="dsh-hm-toolbar" role="toolbar" aria-label="Preview controls"><span className="dsh-hm-fit-label">适应窗口 <span>· 等比显示</span></span>
        <button className="dsh-hm-icon-button" disabled={state.busy} onClick={() => void refresh(controller)} aria-label="Refresh" title="刷新画面"><Icon name="refresh" /></button>
        <button className="dsh-hm-icon-button" disabled={!controller.frame} onClick={() => saveFrame(controller)} aria-label="Screenshot" title="保存截图"><Icon name="camera" /></button>
        <button className="dsh-hm-icon-button" disabled={!controller.frame} onClick={() => { controller.viewRotation = controller.viewRotation === 0 ? 90 : 0; emit(controller) }} aria-label="Rotate view" title="旋转预览"><Icon name="rotate" /></button>
      </div>
      <section className="dsh-hm-stage"><Frame controller={controller} /></section>
      <footer className="dsh-hm-footer">
        <div className="dsh-hm-navigation" role="toolbar" aria-label="Device controls">
          <button className="dsh-hm-icon-button" disabled={disabled} onClick={() => control(controller, { action: 'button', key: 'back' })} aria-label="Back" title="返回"><Icon name="back" /></button>
          <button className="dsh-hm-icon-button" disabled={disabled} onClick={() => control(controller, { action: 'button', key: 'home' })} aria-label="Home" title="主屏幕"><Icon name="home" /></button>
          <button className="dsh-hm-icon-button" disabled={disabled} onClick={() => control(controller, { action: 'button', key: 'recent' })} aria-label="Recents" title="最近任务"><Icon name="recent" /></button>
          <span className="dsh-hm-nav-divider" /><button className="dsh-hm-icon-button dsh-hm-stop" disabled={state.busy} onClick={() => void stop(controller)} aria-label="Stop preview" title="停止预览"><Icon name="stop" /></button>
        </div>
        <form className="dsh-hm-input-row" onSubmit={event => { event.preventDefault(); if (text) { control(controller, { action: 'type', text }); setText('') } }}><input aria-label="Type on device" placeholder="输入文字到设备…" value={text} disabled={disabled} onChange={event => setText(event.target.value)} /><button className="dsh-hm-icon-button" disabled={disabled || !text} aria-label="Send" title="发送文字"><Icon name="send" /></button></form>
        <div className="dsh-hm-frame-meta"><span>{session?.width ?? '—'} × {session?.height ?? '—'}</span><span><span className={'dsh-hm-status-dot' + (controller.frame ? ' is-live' : '')} />{controller.frame ? '实时画面' : '正在获取画面'}</span></div>
      </footer>
    </>}
    {state.error && <p className="dsh-hm-error" role="alert">{state.error}</p>}
  </aside>
}
function DetailsPanel(props: any): React.ReactElement { const resultSession = toolResultSession(props?.block); const controller = controllerFor(props?.sessionId ?? resultSession?.sessionId ?? props?.callId ?? props?.block?.sessionId); useController(controller); useEffect(() => { seedSession(controller, resultSession); activate(controller); return () => { if (active === controller) { controller.visible = false; emit(controller); emit(root) } } }, [controller, resultSession?.sessionId]); return <Panel controller={controller} embedded /> }
function Dock({ sessionId }: { sessionId?: string }): React.ReactElement { const controller = controllerFor(sessionId); useController(controller); return <button className="dsh-hm-dock" onClick={() => open(controller)} aria-label="Open HarmonyOS preview">HarmonyOS preview{controller.session?.connected ? ' · connected' : ''}</button> }
function toolCardState(block: any): 'running' | 'error' | 'completed' { if (!block || typeof block !== 'object' || !('kind' in block)) return 'running'; return block.isError ? 'error' : 'completed' }
function parseToolValue(value: any): any {
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return undefined }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseToolValue(item?.text ?? item?.data ?? item?.content ?? item)
      if (parsed !== undefined) return parsed
    }
    return undefined
  }
  return value
}
function toolResultSummary(block: any): string { const value = block?.result ?? block?.output ?? block?.content; if (value === undefined || value === null) return ''; try { const text = typeof value === 'string' ? value : JSON.stringify(value); return text.slice(0, 160) } catch { return '' } }
function normalizedSession(value: any): Session | undefined { const result = parseToolValue(value); if (!result || typeof result !== 'object' || typeof result.sessionId !== 'string' || typeof result.deviceId !== 'string' || typeof result.connected !== 'boolean') return undefined; return { sessionId: result.sessionId, deviceId: result.deviceId, connected: result.connected, ...(typeof result.startedAt === 'string' ? { startedAt: result.startedAt } : {}), ...(typeof result.state === 'string' ? { state: result.state } : {}), ...(typeof result.frameId === 'number' ? { frameId: result.frameId } : {}), ...(typeof result.width === 'number' ? { width: result.width } : {}), ...(typeof result.height === 'number' ? { height: result.height } : {}) } }
export function toolResultSession(block: any): Session | undefined { for (const value of [block?.result, block?.output, block?.content]) { const result = normalizedSession(value); if (result) return result } return undefined }
export function toolResultSessionId(block: any): string | undefined { for (const value of [block?.result, block?.output, block?.content]) { const result = parseToolValue(value); if (typeof result?.sessionId === 'string') return result.sessionId } return undefined }
function openIfIdle(controller: Controller, session?: Session): void { if (active?.visible && active !== controller) return; openWithSession(controller, session) }
function ToolCard(props: any): React.ReactElement { const block = props?.block; const state = toolCardState(block); const resultSession = toolResultSession(block); const resultSessionId = resultSession?.sessionId; const sessionId = props?.sessionId ?? resultSessionId; const controller = controllerFor(sessionId); const summary = toolResultSummary(block); const autoKey = String(props?.callId ?? props?.toolName ?? '') + ':' + state + ':' + String(resultSessionId ?? ''); const autoOpened = useRef(''); useEffect(() => { if (props?.toolName !== 'harmony_preview_start' || state !== 'completed' || !resultSessionId || autoOpened.current === autoKey) return; autoOpened.current = autoKey; openIfIdle(controller, resultSession) }, [autoKey, controller, props?.toolName, resultSession, resultSessionId, state]); return <div className="dsh-hm-card" data-state={state}><strong>{props?.toolName ?? props?.name ?? 'HarmonyOS tool'}</strong><span>{state}</span>{summary && <small>{summary}</small>}<button onClick={() => openWithSession(controller, resultSession)}>Open preview</button></div> }
const CSS = `
#dsh-harmonyos-panel-host{position:fixed;inset:0;z-index:1200;pointer-events:none}
.dsh-hm-panel{pointer-events:auto;position:absolute;top:0;right:0;bottom:0;box-sizing:border-box;max-width:100%;display:flex;flex-direction:column;min-height:0;min-width:0;color:var(--dsw-alias-label-primary,#24272e);background:var(--dsw-alias-bg-base,#fff);border-left:1px solid var(--dsw-alias-border-l2,#dddfe5);box-shadow:-8px 0 32px #0002;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
.dsh-hm-panel *, .dsh-hm-panel *::before, .dsh-hm-panel *::after{box-sizing:border-box}
.dsh-hm-panel.is-expanded{width:100%;border-left:0}
.dsh-hm-panel.dsh-hm-details-panel{position:relative;top:auto;right:auto;bottom:auto;width:100%;height:clamp(360px,75dvh,900px);box-shadow:none;border:0}
.dsh-hm-header{display:flex;align-items:center;gap:10px;flex:none;min-width:0;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,#dddfe5)}
.dsh-hm-brand{display:grid;place-items:center;flex:none;width:34px;height:38px;border:1px solid var(--dsw-alias-border-l2,#dddfe5);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f5f6f8);color:var(--dsw-alias-label-secondary,#737984)}
.dsh-hm-title-cluster{display:flex;flex-direction:column;flex:1;min-width:0;gap:2px}
.dsh-hm-title-cluster strong{font-size:14px;font-weight:600;letter-spacing:-.2px}
.dsh-hm-device-label{font:11px/1.4 ui-monospace,"Cascadia Code",monospace;color:var(--dsw-alias-label-secondary,#737984);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-hm-status{display:flex;align-items:center;gap:5px;flex:none;font-size:11px;color:var(--dsw-alias-label-secondary,#737984);white-space:nowrap}
.dsh-hm-status-dot{display:inline-block;flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-secondary,#737984)}
.dsh-hm-status-dot.is-live{background:#35b881}
.dsh-hm-panel button{font:inherit;color:inherit;cursor:pointer;transition:background-color .15s,color .15s;flex:none}
.dsh-hm-panel button:disabled{opacity:.35;cursor:default}
.dsh-hm-icon-button{display:inline-grid;place-items:center;width:32px;height:32px;border:0;border-radius:7px;background:transparent;padding:0}
.dsh-hm-icon-button:not(:disabled):hover{background:var(--dsw-alias-bg-layer-1,#f0f1f4)}
.dsh-hm-icon-button:not(:disabled):active{background:var(--dsw-alias-bg-layer-2,#e6e8ed)}
.dsh-hm-panel :is(button,input,select,[tabindex]):focus-visible{outline:2px solid #5c8ff5;outline-offset:2px}
.dsh-hm-toolbar{display:flex;align-items:center;gap:4px;flex:none;min-width:0;padding:5px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,#dddfe5)}
.dsh-hm-fit-label{flex:1;min-width:0;font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,#737984)}
.dsh-hm-fit-label span{font-size:11px;font-weight:400;opacity:.7}
.dsh-hm-stage{display:flex;flex:1;min-height:0;min-width:0;padding:0;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#f4f5f7)}
.dsh-hm-screen{flex:1;min-width:0;min-height:0;position:relative;display:grid;place-items:center;overflow:hidden;padding:12px;background:radial-gradient(ellipse at center,transparent 35%,#00000006)}
.dsh-hm-frame-shell{position:relative;flex:none;border-radius:4px;box-shadow:0 2px 12px #0002}
.dsh-hm-frame{position:absolute;left:50%;top:50%;display:block;max-width:none;max-height:none;touch-action:none;user-select:none;border-radius:4px}
.dsh-hm-loading{display:flex;flex-direction:column;align-items:center;gap:14px;color:var(--dsw-alias-label-secondary,#737984);font-size:12px}
.dsh-hm-loading svg{width:34px;height:34px;opacity:.5}
.dsh-hm-footer{flex:none;display:flex;flex-direction:column;gap:8px;padding:6px 14px 10px;border-top:1px solid var(--dsw-alias-border-l2,#dddfe5);background:var(--dsw-alias-bg-base,#fff)}
.dsh-hm-navigation{display:flex;align-items:center;justify-content:center;gap:18px}
.dsh-hm-navigation .dsh-hm-icon-button{width:36px;height:32px}
.dsh-hm-nav-divider{height:16px;width:1px;background:var(--dsw-alias-border-l2,#dddfe5)}
.dsh-hm-navigation .dsh-hm-stop{color:var(--dsw-alias-label-secondary,#737984)}
.dsh-hm-navigation .dsh-hm-stop:hover{color:#d86363}
.dsh-hm-input-row{display:flex;align-items:center;gap:6px;min-width:0;border:1px solid var(--dsw-alias-border-l2,#dddfe5);border-radius:8px;padding:2px 3px 2px 10px;background:var(--dsw-alias-bg-layer-1,#f5f6f8)}
.dsh-hm-input-row input{flex:1;min-width:0;width:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:12px;padding:5px 0}
.dsh-hm-input-row:focus-within{border-color:#5c8ff5}
.dsh-hm-input-row input::placeholder{color:var(--dsw-alias-label-secondary,#737984)}
.dsh-hm-frame-meta{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary,#737984);font-variant-numeric:tabular-nums}
.dsh-hm-frame-meta>span{display:flex;align-items:center;gap:5px}
.dsh-hm-empty{display:flex;flex:1;min-height:0;overflow:auto;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:28px 24px}
.dsh-hm-empty-device{display:grid;place-items:center;width:64px;height:72px;border:1px solid var(--dsw-alias-border-l2,#dddfe5);border-radius:16px;background:var(--dsw-alias-bg-layer-1,#f5f6f8);color:var(--dsw-alias-label-secondary,#737984);margin-bottom:4px}
.dsh-hm-empty-device svg{width:30px;height:30px}
.dsh-hm-empty strong{font-size:16px;font-weight:600}
.dsh-hm-empty p,.dsh-hm-empty small{color:var(--dsw-alias-label-secondary,#737984);font-size:12px;text-align:center;margin:0 0 8px}
.dsh-hm-empty label{width:100%;max-width:320px;font-size:0}
.dsh-hm-empty select{width:100%;height:38px;font:12px system-ui;color:inherit;background:var(--dsw-alias-bg-layer-1,#f5f6f8);border:1px solid var(--dsw-alias-border-l2,#dddfe5);border-radius:8px;padding:0 10px}
.dsh-hm-primary{height:38px;width:100%;max-width:320px;border:0;border-radius:8px;background:#497bdb;color:#fff!important;font-weight:500!important}
.dsh-hm-primary:not(:disabled):hover{background:#386aca}
.dsh-hm-error{flex:none;margin:0;padding:10px 14px;border-top:1px solid #d8636340;color:#d86363;background:#d863630a;font-size:11px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;max-height:100px;overflow:auto}
.dsh-hm-resize{position:absolute;left:-5px;top:0;bottom:0;width:10px;z-index:2;cursor:ew-resize;touch-action:none;display:grid;place-items:center}
.dsh-hm-resize span{width:3px;height:30px;border-radius:3px;background:var(--dsw-alias-border-l2,#dddfe5);transition:background-color .15s}
.dsh-hm-resize:hover span,.dsh-hm-resize:focus-visible span{background:#5c8ff5}
.dsh-hm-card{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#dddfe5);border-radius:8px}
.dsh-hm-card small{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#737984)}
.dsh-hm-card button,.dsh-hm-dock{padding:5px 10px;border:1px solid var(--dsw-alias-border-l2,#dddfe5);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#f5f6f8);color:var(--dsw-alias-label-primary,#24272e);font:12px/1.4 system-ui;cursor:pointer}
.dsh-hm-card button{margin-left:auto;flex:none}
.dsh-hm-dock{display:inline-flex;align-items:center;width:fit-content}
@media(max-width:760px){.dsh-hm-panel{width:100%!important;border-left:0}.dsh-hm-resize{display:none}.dsh-hm-header{padding:10px 12px}.dsh-hm-fit-label span{display:none}}
@media(max-height:500px){.dsh-hm-header{padding-top:6px;padding-bottom:6px}.dsh-hm-brand{height:30px;width:28px}.dsh-hm-footer{padding-top:3px;padding-bottom:5px;gap:4px}.dsh-hm-input-row{display:none}.dsh-hm-toolbar{padding-top:2px;padding-bottom:2px}}
@media(prefers-reduced-motion:reduce){.dsh-hm-panel button,.dsh-hm-resize span{transition:none}}
`
function installCss(): void { if (document.getElementById('dsh-harmonyos-style')) return; const style = document.createElement('style'); style.id = 'dsh-harmonyos-style'; style.textContent = CSS; document.head.append(style) }
export const inject = ['slots', 'theme', 'locale']
export function apply(ctx: any): void { installCss(); if (typeof document !== 'undefined' && document.body) ensurePortal(); ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'dsh-harmonyos', order: 30 }, Dock)); for (const key of ['harmony_devices', 'harmony_preview_start', 'harmony_preview_stop', 'harmony_preview_info', 'harmony_screenshot', 'harmony_interact', 'harmony_build_run']) { ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key, order: 30 }, ToolCard)); ctx.slots.inject('tool.details.toolview', () => ctx.slots.register({ name: 'tool.details.toolview', key, order: 30 }, DetailsPanel)) } ctx.effect?.(() => () => { for (const controller of controllers.values()) { controller.disposed = true; revokeFrame(controller) }; root.disposed = true; panelHost?.dispose(); panelHost = undefined; document.getElementById('dsh-harmonyos-style')?.remove() }, 'dsh-harmonyos cleanup') }

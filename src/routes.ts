import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { inputText, keyEvent, longPress, swipe, tap } from './hdc.js'
import { HdcError } from './errors.js'
import { beginControl, endControl, getSession, listSessions, publicSession, startSession, stopSession } from './session.js'
import { listDevices } from './hdc.js'

const PREFIX = '/_dsh/dsh-harmonyos'
const TOKEN_TTL_MS = 60_000
const tokens = new Map<string, { sessionId: string; expiresAt: number }>()

type WebServerLike = { register(route: { kind: 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void }

type RouteContext = { webServer: WebServerLike }

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function sendError(res: ServerResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  sendJson(res, error instanceof HdcError ? 409 : 400, { error: message })
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk))
    if (Buffer.concat(chunks).length > 64 * 1024) throw new HdcError('Request body is too large.')
  }
  if (!chunks.length) return {}
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HdcError('Request body must be a JSON object.')
  return value as Record<string, unknown>
}

function tokenFrom(req: IncomingMessage, url: URL): string | undefined {
  const header = req.headers.authorization
  return header?.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token') ?? undefined
}

function authorize(req: IncomingMessage, url: URL, sessionId: string): void {
  const token = tokenFrom(req, url)
  const record = token ? tokens.get(token) : undefined
  if (!record || record.sessionId !== sessionId || record.expiresAt <= Date.now()) throw new HdcError('Preview access token is missing or expired.')
}

function pruneTokens(now = Date.now()): void {
  for (const [token, record] of tokens) if (record.expiresAt <= now) tokens.delete(token)
}

function revokeSessionTokens(sessionId: string): void {
  for (const [token, record] of tokens) if (record.sessionId === sessionId) tokens.delete(token)
}

function isLoopbackHost(value: string): boolean {
  const raw = value.trim().toLowerCase()
  if (raw === '::1' || raw === '0:0:0:0:0:0:0:1' || raw === '::ffff:127.0.0.1') return true
  const host = raw.startsWith('[') ? raw.slice(1, raw.indexOf(']')) : raw.replace(/:\d+$/, '')
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0:0:0:0:0:0:0:1' || host === '::ffff:127.0.0.1'
}

function authorizeLocalRequest(req: IncomingMessage): void {
  const remote = req.socket?.remoteAddress
  if (remote && !isLoopbackHost(remote)) throw new HdcError('HarmonyOS preview routes accept local requests only.')
  const host = req.headers.host
  if (host && !isLoopbackHost(host)) throw new HdcError('HarmonyOS preview host must be local.')
  const origin = req.headers.origin
  if (origin && origin !== 'null') {
    try {
      const originHost = new URL(origin).hostname
      if (!isLoopbackHost(originHost)) throw new HdcError('HarmonyOS preview origin must be local.')
    } catch (error) {
      if (error instanceof HdcError) throw error
      throw new HdcError('HarmonyOS preview origin is invalid.')
    }
  }
  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none') throw new HdcError('Cross-site HarmonyOS preview requests are blocked.')
}

function requireNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new HdcError(key + ' must be a finite number.')
  return value
}

async function control(req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>): Promise<void> {
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  const session = await beginControl(sessionId)
  try {
    const frame = session.frame
    if (!frame) throw new HdcError('Preview has not produced a frame yet.')
    if (body.frameId !== frame.frameId) throw new HdcError('The frame is stale; refresh before controlling the device.')
    const action = body.action
    if (typeof action !== 'string') throw new HdcError('action is required.')
    const x = typeof body.x === 'number' ? body.x : undefined
    const y = typeof body.y === 'number' ? body.y : undefined
    const px = (value: number | undefined, size: number | undefined) => value === undefined ? undefined : Math.round(value * (size ?? 1))
    if (action === 'tap') await tap(session.deviceId, px(x, frame.width) ?? -1, px(y, frame.height) ?? -1)
    else if (action === 'long_press') await longPress(session.deviceId, px(x, frame.width) ?? -1, px(y, frame.height) ?? -1)
    else if (action === 'swipe') await swipe(session.deviceId, px(requireNumber(body, 'fromX'), frame.width) ?? -1, px(requireNumber(body, 'fromY'), frame.height) ?? -1, px(requireNumber(body, 'toX'), frame.width) ?? -1, px(requireNumber(body, 'toY'), frame.height) ?? -1, typeof body.velocity === 'number' ? body.velocity : undefined)
    else if (action === 'button') {
      const key = body.key
      if (key !== 'back' && key !== 'home' && key !== 'recent' && key !== 'power') throw new HdcError('key must be back, home, recent, or power.')
      await keyEvent(session.deviceId, key === 'back' ? 'Back' : key === 'home' ? 'Home' : key === 'recent' ? '5' : 'Power')
    } else if (action === 'type') {
      if (typeof body.text !== 'string') throw new HdcError('text is required.')
      await inputText(session.deviceId, body.text)
    } else throw new HdcError('Unsupported control action: ' + action)
    sendJson(res, 200, publicSession(session))
  } finally {
    endControl(sessionId)
  }
}

export function installHarmonyRoutes(ctx: RouteContext): () => void {
  const dispose = ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const path = url.pathname.slice(PREFIX.length) || '/'
      try {
        authorizeLocalRequest(req)
        if (req.method === 'GET' && path === '/devices') {
          sendJson(res, 200, { devices: await listDevices() })
          return
        }
        if (req.method === 'POST' && path === '/start') {
          const body = await readJson(req)
          const deviceId = typeof body.deviceId === 'string' ? body.deviceId : undefined
          sendJson(res, 200, await startSession(deviceId))
          return
        }
        if (req.method === 'POST' && path === '/grant') {
          pruneTokens()
          const body = await readJson(req)
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
          getSession(sessionId)
          const token = randomBytes(32).toString('base64url')
          const expiresAt = Date.now() + TOKEN_TTL_MS
          tokens.set(token, { sessionId, expiresAt })
          sendJson(res, 200, { token, expiresAt })
          return
        }
        if (path === '/frame' && req.method === 'GET') {
          const sessionId = url.searchParams.get('sessionId') ?? ''
          authorize(req, url, sessionId)
          const session = getSession(sessionId)
          if (!session.frame) { res.writeHead(204); res.end(); return }
          res.writeHead(200, { 'content-type': session.frame.mimeType, 'cache-control': 'no-store', 'x-frame-id': String(session.frame.frameId), 'x-frame-width': String(session.frame.width ?? ''), 'x-frame-height': String(session.frame.height ?? '') })
          res.end(session.frame.data)
          return
        }
        if (path === '/status' && req.method === 'GET') {
          const sessionId = url.searchParams.get('sessionId') ?? ''
          authorize(req, url, sessionId)
          sendJson(res, 200, publicSession(getSession(sessionId)))
          return
        }
        if (path === '/control' && req.method === 'POST') {
          const body = await readJson(req)
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
          authorize(req, url, sessionId)
          await control(req, res, body)
          return
        }
        if (path === '/stop' && req.method === 'POST') {
          const body = await readJson(req)
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
          authorize(req, url, sessionId)
          const result = stopSession(sessionId)
          revokeSessionTokens(sessionId)
          sendJson(res, 200, result)
          return
        }
        sendJson(res, 404, { error: 'not_found' })
      } catch (error) { sendError(res, error) }
    },
  })
  return () => {
    dispose()
    tokens.clear()
  }
}

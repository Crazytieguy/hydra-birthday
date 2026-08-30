import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import {
  getCookie,
  getRequestProtocol,
  setCookie,
} from '@tanstack/react-start/server'
import { MIN_SESSION_TOKEN_LENGTH, newToken } from '../../convex/lib/tokens'

// The browser is the account: a long-lived cookie holds the session token,
// which every gated Convex function receives as an argument. It must stay
// readable by JS (the websocket client sends it), so it is not HttpOnly.
export const SESSION_COOKIE = 'hb_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function readCookie(name: string): string | null {
  const prefix = `${name}=`
  const pair = document.cookie.split('; ').find((c) => c.startsWith(prefix))
  return pair ? decodeURIComponent(pair.slice(prefix.length)) : null
}

// Server-only. Safari and Brave cap cookies written from JavaScript at seven
// days, so the cookie is only ever set over HTTP: at claim time, and again on
// every server-rendered page so the year keeps rolling.
function issueSessionCookie(token: string) {
  setCookie(SESSION_COOKIE, token, {
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: getRequestProtocol() === 'https',
    httpOnly: false,
  })
}

// Root route context reads the cookie on whichever side is rendering: request
// headers during SSR, document.cookie in the browser. No RPC per navigation.
export const readSessionToken = createIsomorphicFn()
  .server((): string | null => {
    const token = getCookie(SESSION_COOKIE) ?? null
    if (token) issueSessionCookie(token)
    return token
  })
  .client((): string | null => readCookie(SESSION_COOKIE))

// Called by the invite page once `invites.claim` has committed.
export const persistSession = createServerFn({ method: 'POST' })
  .validator((data: { sessionToken: string }) => {
    if (data.sessionToken.length < MIN_SESSION_TOKEN_LENGTH)
      throw new Error('Invalid session token')
    return data
  })
  .handler(({ data }) => {
    issueSessionCookie(data.sessionToken)
    return null
  })

// The session secret is minted before the claim mutation and kept in
// sessionStorage until the cookie provably holds it, so a retry after a lost
// response reuses it and the (idempotent) mutation accepts it instead of
// reporting the link as used. Returns null when the browser can't hold the
// secret or a cookie — then the invite must not be consumed at all.
const pendingKey = (inviteToken: string) => `hb_pending_session:${inviteToken}`

export function getOrCreatePendingSessionToken(
  inviteToken: string,
): string | null {
  try {
    const attributes = `Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    document.cookie = `hb_probe=1; Max-Age=60; ${attributes}`
    const cookiesWork = readCookie('hb_probe') === '1'
    document.cookie = `hb_probe=; Max-Age=0; ${attributes}`
    if (!cookiesWork) return null

    const key = pendingKey(inviteToken)
    const stored = sessionStorage.getItem(key)
    if (stored) return stored
    const fresh = newToken()
    sessionStorage.setItem(key, fresh)
    return sessionStorage.getItem(key) === fresh ? fresh : null
  } catch {
    return null
  }
}

export function hasPendingSessionToken(inviteToken: string): boolean {
  try {
    return sessionStorage.getItem(pendingKey(inviteToken)) !== null
  } catch {
    return false
  }
}

export function clearPendingSessionToken(inviteToken: string): void {
  try {
    sessionStorage.removeItem(pendingKey(inviteToken))
  } catch {
    // Nothing stored.
  }
}

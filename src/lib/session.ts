import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { newToken } from '../../convex/lib/tokens'

// The browser is the account: a long-lived cookie holds the session token,
// which every gated Convex function receives as an argument. It must stay
// readable by JS (the websocket client sends it), so it is not HttpOnly.
export const SESSION_COOKIE = 'hb_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  const pair = document.cookie.split('; ').find((c) => c.startsWith(prefix))
  return pair ? decodeURIComponent(pair.slice(prefix.length)) : null
}

// Root route context reads the cookie on whichever side is rendering: request
// headers during SSR, document.cookie in the browser. No RPC per navigation.
export const readSessionToken = createIsomorphicFn()
  .server((): string | null => getCookie(SESSION_COOKIE) ?? null)
  .client((): string | null => readCookie(SESSION_COOKIE))

function cookieAttributes(maxAge: number): string {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  return `Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
}

// Returns false when the browser blocks cookies (the write fails silently).
export function writeSessionCookie(token: string): boolean {
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes(SESSION_MAX_AGE_SECONDS)}`
  return readCookie(SESSION_COOKIE) === token
}

// The session secret is minted before the claim mutation and kept in
// sessionStorage until the claim succeeds, so a retry after a lost response
// reuses it and the (idempotent) mutation accepts it instead of reporting the
// link as used. Returns null when the browser can't hold the secret or a
// cookie — then the invite must not be consumed at all.
const pendingKey = (inviteToken: string) => `hb_pending_session:${inviteToken}`

export function getOrCreatePendingSessionToken(
  inviteToken: string,
): string | null {
  try {
    document.cookie = `hb_probe=1; ${cookieAttributes(60)}`
    const cookiesWork = readCookie('hb_probe') === '1'
    document.cookie = `hb_probe=; ${cookieAttributes(0)}`
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

export function clearPendingSessionToken(inviteToken: string): void {
  try {
    sessionStorage.removeItem(pendingKey(inviteToken))
  } catch {
    // Nothing stored.
  }
}

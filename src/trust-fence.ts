/**
 * Browser-trust fence for this plugin's routes, behaviorally identical to the
 * /api gateway's fence in @deepseek-ai/dsh-client-connection
 * (src/api-request-trust.ts + src/loopback-hostname.ts, copied here because
 * the package does not export those helpers and a plugin must not depend on
 * another package's internals). Host-header loopback or a configured trusted
 * authority passes; cross-site browser markers refuse.
 *
 * This is a DNS-rebinding / cross-site defense, not authentication: the plugin
 * only ever reads repository metadata, but an unfenced route would let any page
 * the user visits probe the local filesystem layout through their browser.
 */
import type { PluginHttpRequest } from './context-types.ts'

function header(request: PluginHttpRequest, name: string): string | undefined {
  const value = request.headers[name]
  return typeof value === 'string' ? value : undefined
}

/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** Whether a normalized URL hostname names the local loopback authority. */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** Canonical authority form: hostname, or hostname:port when a port was written. */
function canonicalAuthority(entry: string, entryUrl: URL): string {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/** Whether the request authority matches a trustedHosts entry (exact or port-less). */
function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/**
 * Decide whether one plugin request may reach the routes.
 *
 * @param request - node HTTP request facts (headers).
 * @param trustedHosts - non-loopback authorities this deployment serves.
 * @returns true when the Host is ours and browser markers are same-origin.
 */
export function isTrustedApiRequest(
  request: PluginHttpRequest,
  trustedHosts: readonly string[],
): boolean {
  const host = header(request, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  if (header(request, 'sec-fetch-site') === 'cross-site') return false
  // Origin fence: when a browser attaches an Origin it must name this hostname
  // (the Host fence above already bound the authority, so the port must not
  // re-decide trust). Comparing hostname rather than host keeps non-default-port
  // loopback pages working on Chromium builds that drop the port from Origin.
  // An absent Origin is fine — the Host fence already bound the request. The
  // literal "null" (sandboxed iframes, file: pages) is an opaque origin: refused.
  const origin = header(request, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).hostname === hostUrl.hostname
  } catch {
    return false
  }
}

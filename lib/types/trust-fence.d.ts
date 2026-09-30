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
import type { PluginHttpRequest } from './context-types.ts';
/** Whether a normalized URL hostname names the local loopback authority. */
export declare function isLoopbackHostname(hostname: string): boolean;
/**
 * Decide whether one plugin request may reach the routes.
 *
 * @param request - node HTTP request facts (headers).
 * @param trustedHosts - non-loopback authorities this deployment serves.
 * @returns true when the Host is ours and browser markers are same-origin.
 */
export declare function isTrustedApiRequest(request: PluginHttpRequest, trustedHosts: readonly string[]): boolean;

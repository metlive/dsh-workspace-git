/**
 * dsh-workspace-git — host half.
 *
 * Owns exactly one fenced route, `POST /workspace-git/api/branches`, which
 * answers "what branch is checked out in this directory?" for a batch of
 * workspace paths. Branch detection reads `.git/HEAD` directly (see
 * git-ref.ts / git-branch.ts) — no subprocess, no `git` binary requirement.
 *
 * Two properties are load-bearing for the whole plugin:
 *
 * - **Silence is a valid answer.** A path that is not a repository resolves to
 *   `null`, identically to a path that is unreadable or has a corrupt HEAD. The
 *   client draws nothing for `null`. There is no error placeholder anywhere in
 *   this plugin, because "this folder is not a git repo" is the common case,
 *   not a failure.
 * - **The route is fenced.** Loopback Host header or a `--trusted-host`
 *   authority, same rule as the /api gateway (see trust-fence.ts).
 *
 * The cache is per-activation and disposed with the fiber, so an HMR reload
 * never leaves a stale map behind and never shares state across activations.
 */
import { BranchCache } from './git-branch.ts'
import { API_PREFIX, createApiHandler } from './routes.ts'
import { isTrustedApiRequest } from './trust-fence.ts'
import type { Context } from './context-types.ts'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-workspace-git'

/** Services required before mounting: the webserver routes and the session store. */
export const inject = ['webServer', 'sessions']

/**
 * The web runtime's bind-derived trust list, read per request so a replaced
 * list takes effect without a plugin restart. `webRuntime` is not in `inject`:
 * it is provided by the web app bundle and probed optionally, so the plugin
 * still mounts (with a loopback-only fence) on a host that lacks it.
 * @param ctx - the host plugin context.
 * @returns the trusted authorities, or an empty list.
 */
function trustedHostsOf(ctx: Context): readonly string[] {
  const runtime = ctx.get('webRuntime') as { trustedHosts?: readonly string[] } | undefined
  return runtime?.trustedHosts ?? []
}

/**
 * Plugin body: mount the fenced route and own the branch cache.
 * @param ctx - host plugin context (webServer, sessions).
 */
export function apply(ctx: Context): void {
  const cache = new BranchCache()
  ctx.effect(() => () => cache.dispose(), 'dsh-workspace-git: branch cache')

  const fence = (req: Parameters<typeof isTrustedApiRequest>[0]): boolean =>
    isTrustedApiRequest(req, trustedHostsOf(ctx))

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: createApiHandler(cache, fence, ctx),
    }),
    'dsh-workspace-git: /workspace-git/api routes',
  )
}

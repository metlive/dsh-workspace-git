import type { Context } from './context-types.ts';
/** Plugin identity for cordis.yml rows. */
export declare const name = "dsh-workspace-git";
/** Services required before mounting: the webserver routes and the session store. */
export declare const inject: string[];
/**
 * Plugin body: mount the fenced route and own the branch cache.
 * @param ctx - host plugin context (webServer, sessions).
 */
export declare function apply(ctx: Context): void;

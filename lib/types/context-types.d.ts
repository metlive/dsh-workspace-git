/**
 * Structural types for the cordis services this plugin consumes, plus the
 * Context face both halves share.
 *
 * The type base is the vendored `@deepseek-ai/cordis` Context (the runtime DSH
 * actually runs); the service members this plugin touches are restated below
 * as structural mirrors and combined with the base by INTERSECTION.
 *
 * Intersection (not `declare module` augmentation) is deliberate, and follows
 * the same reasoning as dsh-better-sidebar: DSH's own packages already augment
 * `@deepseek-ai/cordis`, and the host and client halves declare *different*
 * types for the same member (host `sessions: SessionStore` vs client runtime
 * `sessions: ISessions`), so a single program that re-declares them would fail
 * interface merging (TS2717). Intersecting keeps every face available and lets
 * each call site resolve against the member it needs without conflict.
 *
 * This file must stay FREE of Node.js types (`node:http`, `node:stream`,
 * `Buffer`): it is part of the CLIENT-reachable declaration graph, so a Node
 * import here would leak into browser-only consumer builds. The webServer faces
 * below are therefore structural mirrors with plain interfaces (the host casts
 * to real Node types at the boundary that needs them).
 */
import type { Context as CordisContext } from '@deepseek-ai/cordis';
/** The request face route handlers see (structural subset of node's IncomingMessage). */
export interface PluginHttpRequest {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>;
}
/** The response face route handlers write to (structural subset of ServerResponse). */
export interface PluginHttpResponse {
    statusCode: number;
    writeHead(status: number, headers?: Record<string, string>): void;
    end(body?: string | Uint8Array): void;
}
/** One named webserver route (mirror of the host-webserver WebRoute). */
export interface PluginWebRoute {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (req: PluginHttpRequest, res: PluginHttpResponse) => void | Promise<void>;
}
/** The webServer service face this plugin uses. */
export interface PluginWebServer {
    register(route: PluginWebRoute): () => void;
}
/** A published session's header slice the plugin reads (authoritative cwd). */
export interface PluginSessionHeader {
    cwd?: string;
}
/** The host session store face (`ctx.sessions.get(id)` returns the live session). */
export interface PluginSessionStore {
    get(id: string): {
        header: PluginSessionHeader;
    } | undefined;
}
/**
 * The web runtime service face (mirror of @deepseek-ai/dsh-web-app's
 * WebRuntimeValues): the bind-derived trust list the /api gateway's fence
 * accepts — LAN IP literals sampled when the server binds all interfaces, plus
 * explicit `--trusted-host` authorities.
 */
export interface PluginWebRuntime {
    trustedHosts: readonly string[];
}
/**
 * The host session-persistence face (mirror of the sessionPersistence service):
 * detached inspection of a persisted session. Used as the third fallback when a
 * session is not live yet (cold page load), so a branch is not lost merely
 * because the agent has not been resumed.
 */
export interface PluginSessionPersistence {
    inspect(sessionId: string): Promise<{
        meta: {
            cwd?: string;
        };
    }>;
}
/** The settings service face (mirror of @deepseek-ai/dsh-settings' SettingsProvider). */
export interface PluginSettingsService {
    register<T>(ns: string, schema: unknown, options?: {
        base?: Partial<T>;
        applies?: 'live' | 'restart';
    }): {
        get(): T;
        watch(callback: (next: T, prev: T) => void | Promise<void>): () => void;
        update(patch: object): Promise<void>;
    };
}
/** The client locale service face (mirror of @deepseek-ai/dsh-client-locale's LocaleRuntime). */
export interface PluginLocaleService {
    getSnapshot(): {
        active: string;
    };
    subscribe(fn: () => void): () => void;
    register(ns: string, locale: string, dict: Record<string, string>): () => void;
}
/** Registration options this plugin passes to `ctx.slots.register`. */
export interface PluginSlotRegisterOptions {
    name: string;
    key?: string;
    id?: string;
    order?: number;
    label?: string | (() => string);
    locale?: string;
    registrant?: string;
    inject?: (...args: any[]) => Record<string, unknown>;
    children?: Record<string, unknown>;
}
/** The client slots service face (register returns the disposer). */
export interface PluginSlotsService {
    register(options: PluginSlotRegisterOptions, component: unknown): () => void;
    /** Run a callback for each declaration lifetime of a slot. */
    inject(key: string, callback: () => () => void): () => void;
}
/** The client session list row this plugin reads (cwd for the header chip). */
export interface PluginSessionSummary {
    id: string;
    cwd?: string;
    displayTitle: string;
}
/** The client session list snapshot. */
export interface PluginSessionList {
    current: string | undefined;
    byId: Record<string, PluginSessionSummary>;
}
/** The client sessions service face (only the list feed is needed). */
export interface PluginSessionsService {
    list: {
        getSnapshot(): PluginSessionList;
        subscribe(fn: () => void): () => void;
    };
}
/**
 * The shape this plugin actually consumes, intersected with the vendored
 * cordis `Context` below.
 *
 * Every member beyond `webServer`/`sessions` is OPTIONAL on purpose: the host
 * half and the client half see different service sets, and a deployment may
 * lack the persistence or settings service entirely. Cordis guards service
 * access without `inject`, so the optional members are probed with `ctx.get`.
 */
export interface WorkspaceGitContextShape {
    /** The webServer service face (host half only). */
    webServer: PluginWebServer;
    /** The session store (host `.get`) and the client list feed (`.list`). */
    sessions: PluginSessionStore & PluginSessionsService;
    /** The client slot registry (client half only). */
    slots: PluginSlotsService;
    /** The client locale service (client half only). */
    locale: PluginLocaleService;
    /** The web runtime trust list (bind-derived; host half only). */
    webRuntime: PluginWebRuntime;
    /** The host session-persistence face (optional; cold-session cwd fallback). */
    sessionPersistence?: PluginSessionPersistence;
    /** The settings service face (optional). */
    settings?: PluginSettingsService;
}
/**
 * The Context this plugin sees: the vendored cordis Context intersected with
 * the structural service faces above.
 */
export type Context = CordisContext & WorkspaceGitContextShape;

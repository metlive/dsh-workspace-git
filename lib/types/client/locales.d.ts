/**
 * Minimal zh/en copy for the plugin. The client `apply` attaches the locale
 * service (`ctx.locale`, provided by `@deepseek-ai/dsh-client-locale`) and
 * registers these dictionaries under {@link LOCALE_NS}, so the copy follows
 * the Host-backed language preference and switches live. Without an attached
 * service (standalone/test compositions) the browser language decides.
 */
/** The locale namespace this plugin owns. */
export declare const LOCALE_NS = "workspaceGit";
/** The zh dictionary. */
export declare const zh: Record<string, string>;
/** The en dictionary. */
export declare const en: Record<string, string>;
/**
 * Attach (or detach) the locale service the module-level `t()` resolves
 * through. Called by the client `apply`; passing undefined restores the
 * browser-language fallback.
 * @param service - the locale service face, or undefined.
 */
export declare function attachLocale(service: {
    getSnapshot(): {
        active: string;
    };
} | undefined): void;
/** Whether the active locale is Chinese. */
export declare function isZh(): boolean;
/**
 * Translate one key.
 * @param key - a key of {@link zh} / {@link en}.
 * @returns the copy for the active language, falling back to the key itself.
 */
export declare function t(key: keyof typeof zh): string;

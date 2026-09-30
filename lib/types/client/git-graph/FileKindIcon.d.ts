/**
 * Small glyphs for the commit changed-file tree. Icons pick by directory vs
 * file extension so hierarchy reads faster without pulling an icon package.
 */
export interface FileKindIconProps {
    kind: 'dir' | 'file';
    /** File / folder name used to pick an extension glyph. */
    name: string;
    size?: number;
}
/**
 * @returns a 14px-ish svg glyph tinted by kind.
 */
export declare function FileKindIcon({ kind, name, size }: FileKindIconProps): React.ReactNode;

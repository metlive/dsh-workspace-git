/**
 * Small glyphs for the commit changed-file tree. Icons pick by directory vs
 * file extension so hierarchy reads faster without pulling an icon package.
 */

export interface FileKindIconProps {
  kind: 'dir' | 'file'
  /** File / folder name used to pick an extension glyph. */
  name: string
  size?: number
}

type FileGlyph = 'folder' | 'code' | 'config' | 'style' | 'image' | 'doc' | 'lock' | 'file'

function glyphFor(kind: 'dir' | 'file', name: string): FileGlyph {
  if (kind === 'dir') return 'folder'
  const lower = name.toLowerCase()
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte', 'py', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp'].includes(ext)) {
    return 'code'
  }
  if (['json', 'jsonc', 'yml', 'yaml', 'toml', 'ini', 'env', 'xml', 'plist'].includes(ext)
    || lower === 'dockerfile' || lower.startsWith('dockerfile.')
    || lower === '.gitignore' || lower === '.npmrc' || lower === '.editorconfig') {
    return 'config'
  }
  if (['css', 'scss', 'sass', 'less', 'styl'].includes(ext)) return 'style'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) return 'image'
  if (['md', 'mdx', 'txt', 'rst', 'adoc'].includes(ext)) return 'doc'
  if (['lock', 'sum'].includes(ext) || lower.endsWith('-lock.json') || lower === 'pnpm-lock.yaml' || lower === 'yarn.lock') {
    return 'lock'
  }
  return 'file'
}

function colorFor(glyph: FileGlyph): string {
  switch (glyph) {
    case 'folder':
      return '#e3b341'
    case 'code':
      return '#3b82f6'
    case 'config':
      return '#a855f7'
    case 'style':
      return '#ec4899'
    case 'image':
      return '#22c55e'
    case 'doc':
      return '#64748b'
    case 'lock':
      return '#f59e0b'
    default:
      return 'var(--dsw-alias-label-tertiary)'
  }
}

/**
 * @returns a 14px-ish svg glyph tinted by kind.
 */
export function FileKindIcon({ kind, name, size = 14 }: FileKindIconProps): React.ReactNode {
  const glyph = glyphFor(kind, name)
  const fill = colorFor(glyph)
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none' as const,
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true as const,
    focusable: false as const,
    style: { flex: 'none' as const, display: 'block' as const, color: fill },
  }

  if (glyph === 'folder') {
    return (
      <svg {...common}>
        <path
          d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.2l1.2 1.2H13A1.5 1.5 0 0 1 14.5 5.7v6.8A1.5 1.5 0 0 1 13 14H3A1.5 1.5 0 0 1 1.5 12.5v-8Z"
          fill="currentColor"
        />
      </svg>
    )
  }

  if (glyph === 'code') {
    return (
      <svg {...common}>
        <path d="M5.4 4.2 1.8 8l3.6 3.8.9-.9L3.7 8l2.6-2.9-.9-.9Zm5.2 0-.9.9L12.3 8l-2.6 2.9.9.9L14.2 8l-3.6-3.8Z" fill="currentColor" />
        <path d="M9.1 3.2 6.6 12.8h1.1l2.5-9.6H9.1Z" fill="currentColor" opacity={0.7} />
      </svg>
    )
  }

  if (glyph === 'config') {
    return (
      <svg {...common}>
        <path d="M8 3.2a1.2 1.2 0 0 1 1.15.86l.12.4.38.16a4.8 4.8 0 0 1 .7.36l.35-.2.36.2-.2.35c.14.22.26.45.36.7l.4.12A1.2 1.2 0 0 1 12.8 8a1.2 1.2 0 0 1-.86 1.15l-.4.12c-.1.25-.22.48-.36.7l.2.35-.2.36-.35-.2a4.8 4.8 0 0 1-.7.36l-.12.4A1.2 1.2 0 0 1 8 12.8a1.2 1.2 0 0 1-1.15-.86l-.12-.4a4.8 4.8 0 0 1-.7-.36l-.35.2-.36-.2.2-.35a4.8 4.8 0 0 1-.36-.7l-.4-.12A1.2 1.2 0 0 1 3.2 8a1.2 1.2 0 0 1 .86-1.15l.4-.12c.1-.25.22-.48.36-.7l-.2-.35.2-.36.35.2c.22-.14.45-.26.7-.36l.12-.4A1.2 1.2 0 0 1 8 3.2Zm0 3.1A1.7 1.7 0 1 0 8 9.7 1.7 1.7 0 0 0 8 6.3Z" fill="currentColor" />
      </svg>
    )
  }

  if (glyph === 'style') {
    return (
      <svg {...common}>
        <path d="M3 2.5h10l-1.2 9.2L8 14.2 4.2 11.7 3 2.5Zm2 .9.9 7.1L8 12.5l2.1-1.9.9-7.1H5Z" fill="currentColor" />
      </svg>
    )
  }

  if (glyph === 'image') {
    return (
      <svg {...common}>
        <path d="M2.5 3.5A1.5 1.5 0 0 1 4 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 12 14H4A1.5 1.5 0 0 1 2.5 12.5v-9ZM4 3.2a.3.3 0 0 0-.3.3v7.4l2.4-2.4 1.6 1.6 2.8-2.8 2.8 2.8V3.5a.3.3 0 0 0-.3-.3H4Zm2.2 2.1a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z" fill="currentColor" />
      </svg>
    )
  }

  if (glyph === 'doc') {
    return (
      <svg {...common}>
        <path d="M4 2.5h5.2L12.5 5.8V13.5A1 1 0 0 1 11.5 14.5h-7A1 1 0 0 1 3.5 13.5v-10A1 1 0 0 1 4.5 2.5H4Zm5 .8V6h2.6L9 3.3ZM5.2 8h5.6v1H5.2V8Zm0 2h5.6v1H5.2v-1Zm0 2h3.8v1H5.2v-1Z" fill="currentColor" />
      </svg>
    )
  }

  if (glyph === 'lock') {
    return (
      <svg {...common}>
        <path d="M5.2 6.2V5a2.8 2.8 0 0 1 5.6 0v1.2h.9A1.3 1.3 0 0 1 13 7.5v5.2A1.3 1.3 0 0 1 11.7 14H4.3A1.3 1.3 0 0 1 3 12.7V7.5a1.3 1.3 0 0 1 1.3-1.3h.9Zm1.2 0h3.2V5a1.6 1.6 0 0 0-3.2 0v1.2Z" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M4 2.5h5.2L12.5 5.8V13.5A1 1 0 0 1 11.5 14.5h-7A1 1 0 0 1 3.5 13.5v-10A1 1 0 0 1 4.5 2.5H4Zm5 .8V6h2.6L9 3.3Z" fill="currentColor" />
    </svg>
  )
}

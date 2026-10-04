/**
 * Help dialog for a shipped agent preset: the same system Modal / tabs /
 * Markdown surfaces the official settings cards use for 模式说明 and 如何使用.
 */
import { useEffect, useId, useState, type ReactNode } from 'react'
import { MarkdownText, Modal, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GuidePage, PresetGuide } from './guides.ts'

const STYLE_ID = 'workspace-git-preset-guide-dialog-css'
const DIALOG_CLASS = 'workspace-git-preset-guide-dialog'
const CSS = `
.${DIALOG_CLASS} {
  width: 600px !important;
  min-width: 600px !important;
  max-width: min(600px, calc(100vw - 48px)) !important;
  box-sizing: border-box !important;
}
@media (max-width: 648px) {
  .${DIALOG_CLASS} {
    width: calc(100vw - 48px) !important;
    min-width: 0 !important;
  }
}
`

function ensureGuideDialogStyles(): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) {
    existing.textContent = CSS
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

export interface PresetGuideDialogProps {
  guide: PresetGuide
  initialPage: GuidePage
  t?: (key: string) => string
  onClose: () => void
}

/**
 * Open the curated guide in a system modal.
 * @param props - guide keys, starting tab, translator, close handler.
 */
export function PresetGuideDialog({
  guide,
  initialPage,
  t,
  onClose,
}: PresetGuideDialogProps): ReactNode {
  const label = (key: string, fallback: string): string => t?.(key) ?? fallback
  const [page, setPage] = useState<GuidePage>(initialPage)
  const guideId = useId()

  useEffect(() => {
    setPage(initialPage)
  }, [initialPage, guide])

  const title = label(guide.name, guide.name)
  const markdownLabels = {
    code: {
      copyLabel: label('guideCopy', 'Copy'),
      copiedLabel: label('guideCopied', 'Copied'),
      toolbarLabels: {
        codeLabel: label('codeBlockTitle', 'Code'),
        wrapLabel: label('codeBlockWrap', 'Wrap'),
        unwrapLabel: label('codeBlockUnwrap', 'Unwrap'),
      },
    },
    footnotes: label('guideFootnotes', 'Footnotes'),
  }

  useEffect(() => {
    ensureGuideDialogStyles()
  }, [])

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={label(guide.intro, '')}
      closeLabel={label('close', 'Close')}
      className={DIALOG_CLASS}
    >
      <div
        data-workspace-git-preset-guide=""
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <SegmentedTabs
          label={label('guideSections', 'Guide sections')}
          value={page}
          onChange={setPage}
          items={[
            {
              value: 'explanation',
              label: label('modeExplanation', 'Mode details'),
              id: `${guideId}-explanation-tab`,
              panelId: `${guideId}-explanation-panel`,
            },
            {
              value: 'usage',
              label: label('howToUse', 'How to use'),
              id: `${guideId}-usage-tab`,
              panelId: `${guideId}-usage-panel`,
            },
          ]}
        />
        {(['explanation', 'usage'] as const).map((section) => (
          <div
            key={section}
            id={`${guideId}-${section}-panel`}
            role="tabpanel"
            aria-labelledby={`${guideId}-${section}-tab`}
            hidden={page !== section}
            tabIndex={0}
            style={{ minWidth: 0 }}
          >
            <MarkdownText
              text={label(guide[section], '')}
              labels={markdownLabels}
            />
          </div>
        ))}
      </div>
    </Modal>
  )
}

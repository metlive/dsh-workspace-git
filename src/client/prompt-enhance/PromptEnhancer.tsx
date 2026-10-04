/**
 * The prompt-enhancer control: one icon button in the composer's left cluster.
 *
 * ## Why this seat
 *
 * It registers into `conversation.input.right` — the compact-control run in the
 * composer's TRAILING cluster, which `ui-conversation` renders immediately left
 * of the model selector. It deliberately does NOT sit in `conversation.input.left`
 * beside the branch pill: that cluster and the model selector are separate
 * containers, so the rightmost occupant of `input.left` is still a whole cluster
 * away from the picker. The runtime's own contract for this seat reads
 * "Compact controls before the composer submit action" and it is a `list`, so
 * nothing has to be shadowed — unlike `conversation.input.model`, a `single`
 * seat the official picker holds at priority 0.
 *
 * ## How the draft is read and written
 *
 * `ui-conversation` publishes `uiSession.provide({ hooks: ["input"], props:
 * ["inputActions"] })`. The slot runtime materializes those per session, so this
 * component receives `useInput` (a selector hook over the draft state) and
 * `inputActions` (`setDraft`) as ordinary props — the same two props `InputBar`
 * itself takes. No DOM access, no textarea ref, no React internals.
 *
 * ## Failure is visible, never destructive
 *
 * The one rule this control must never break: the user's text survives. The
 * rewrite is only written on success, and every failure path leaves the draft
 * exactly as it was and shows why. Editing continues to work while a request is
 * in flight; the result overwrites whatever is there when it lands, which is
 * the behavior this plugin was asked for.
 *
 * ## In flight looks in flight
 *
 * While a request is running the glyph is swapped for a spinner. Disabling the
 * button alone is not enough feedback: a disabled icon that never changes reads
 * as a dead control, not a pending one, and a rewrite takes seconds.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { enhancePrompt, WorkspaceGitApiError } from '../api.ts'
import { EnhanceIcon, EnhanceSpinner } from './EnhanceIcon.tsx'

/** The composer's draft state, as `useInput` selects from it. */
interface InputStateLike {
  draft?: string
  phase?: string
}

/** The write face `ui-conversation` publishes for the composer. */
interface InputActionsLike {
  setDraft?: (text: string) => void
}

/** Props the seat composes for this control. */
export interface PromptEnhancerProps {
  /** The session whose model performs the rewrite. */
  sessionId?: string
  /** Draft-state selector hook, published through the session scope. */
  useInput?: <T>(selector: (state: InputStateLike) => T) => T
  /** Composer write face, published through the session scope. */
  inputActions?: InputActionsLike
  /** Namespace-bound translator supplied by the seat. */
  t?: (key: string) => string
}

/**
 * Human-readable text for one refusal code.
 *
 * Kept local rather than translated key-by-key: these are diagnostics for a
 * deliberate user action, and a code with no entry still reads correctly via
 * the fallback below.
 *
 * The fallback names the code rather than saying only "enhancement failed".
 * A generic message is a dead end: `internal` and `network` are different
 * problems with different fixes, and the user is the one who can see the DevTools
 * network panel this text points them at.
 * @param code - the machine code from the API envelope.
 * @param message - the server's own message, appended when it adds detail.
 * @param t - the namespace translator.
 * @returns the message to show.
 */
function refusalText(code: string, message: string | undefined, t: (key: string) => string): string {
  switch (code) {
    case 'empty-draft': return t('enhanceEmpty')
    case 'draft-too-large': return t('enhanceTooLarge')
    case 'session-not-found': return t('enhanceNoSession')
    case 'no-model': return t('enhanceNoModel')
    case 'no-llm': return t('enhanceNoService')
    case 'timeout': return t('enhanceTimeout')
    case 'truncated': return t('enhanceTruncated')
    case 'empty-result': return t('enhanceEmptyResult')
    case 'model-error': return t('enhanceModelError')
    case 'network': return t('enhanceNetwork')
    default: {
      // Keep the server's reason visible: it is the only clue that survives
      // from a refusal this client version does not know about yet.
      const detail = message === undefined || message === '' ? code : `${code}: ${message}`
      return `${t('enhanceFailed')} (${detail})`
    }
  }
}

/**
 * The enhancer button.
 * @param props - the composed slot props.
 * @returns the button, or null when the composer face is unavailable.
 */
export function PromptEnhancer({ sessionId, useInput, inputActions, t }: PromptEnhancerProps): ReactNode {
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [toastSeq, setToastSeq] = useState(0)
  // The in-flight request, so unmount (or a second click) can cancel it instead
  // of letting a stale rewrite land on a composer the user has moved on from.
  const inFlight = useRef<AbortController | null>(null)

  // Cancel on unmount: a session switch mid-request must not write into the
  // next session's composer.
  useEffect(() => () => { inFlight.current?.abort() }, [])

  const label = (key: string, fallback: string): string => {
    const translated = t?.(key)
    return translated === undefined || translated === key ? fallback : translated
  }

  // All hooks run before this return; the seat may lack the composer face when
  // the declaration has not landed yet.
  const draft = useInput?.((state) => (typeof state.draft === 'string' ? state.draft : '')) ?? ''
  const phase = useInput?.((state) => state.phase) ?? undefined
  const writable = inputActions?.setDraft !== undefined
  const submitting = phase === 'submitting' || phase === 'adjudicating'
  const empty = draft.trim() === ''

  if (sessionId === undefined || !writable) return null

  const run = async (): Promise<void> => {
    // Ignore a second click while one rewrite is in flight.
    if (busy || submitting || empty) return
    const raw = draft
    const controller = new AbortController()
    inFlight.current = controller
    setBusy(true)
    try {
      const result = await enhancePrompt(sessionId, raw, controller.signal)
      // Overwrite, as configured. `setDraft` is the composer's own write face,
      // so the editor, its undo stack, and the draft mirror all stay coherent.
      inputActions.setDraft?.(result.draft)
    } catch (error) {
      // An abort is not a failure to report: it is this component or the user
      // cancelling, and the draft was never touched.
      if (controller.signal.aborted) return
      const code = error instanceof WorkspaceGitApiError ? error.code : 'unknown'
      const message = error instanceof WorkspaceGitApiError ? error.message : error instanceof Error ? error.message : undefined
      setToastSeq((value) => value + 1)
      setToast(refusalText(code, message, (key) => label(key, 'Could not enhance the prompt.')))
    } finally {
      if (inFlight.current === controller) inFlight.current = null
      setBusy(false)
    }
  }

  const title = busy
    ? label('enhanceBusy', 'Enhancing…')
    : label('enhanceTitle', 'Enhance this prompt with the model')

  return (
    <>
      <button
        type="button"
        data-workspace-git-prompt-enhance=""
        data-enhance-state={busy ? 'busy' : 'idle'}
        aria-label={title}
        title={title}
        aria-busy={busy || undefined}
        disabled={busy || submitting || empty}
        onClick={() => { void run() }}
        onMouseEnter={(e) => {
          // Hover tint matches the branch pill next to it, so the two controls
          // in this cluster feel like one set. Applied as an inline background
          // rather than a stylesheet rule: the plugin ships no CSS, and the
          // branch button does exactly this.
          //
          // The literal is the two-step fallback the CSS cascade does for us in
          // a stylesheet: the theme token first, and #f1f1f1 — the value the
          // branch trigger itself uses — only if the token is undefined. A bare
          // `var(--token)` with no fallback resolves to TRANSPARENT when the
          // token is missing, which would silently make hover do nothing.
          //
          // A DISABLED button must not tint: a hover chip on a control that
          // cannot be pressed reads as "go ahead", the opposite of what
          // busy/empty mean.
          if (busy || submitting || empty) return
          e.currentTarget.style.background
            = 'var(--dsw-alias-interactive-bg-hover, #f1f1f1)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 0,
          border: 0,
          // Fully round, and NOT changed on hover: the shape is the button's,
          // so a circular hover chip needs no per-state geometry — swapping
          // borderRadius in the mouse handlers would make the corner visibly
          // morph as the pointer crosses the edge.
          borderRadius: '999px',
          background: 'transparent',
          color: 'var(--dsw-alias-label-secondary)',
          cursor: busy || submitting || empty ? 'default' : 'pointer',
          // Dimmed only when there is nothing to enhance. While busy the
          // spinner is the message, so it stays at full strength — `disabled`
          // and the default cursor already say "not clickable".
          opacity: empty ? 0.4 : 1,
          flex: 'none',
        }}
      >
        {/* Swap the glyph for the spinner while in flight: the icon alone
            cannot convey "running" — the button is disabled but otherwise
            looks idle, which reads as a dead control rather than a wait. */}
        {busy ? <EnhanceSpinner size={15} /> : <EnhanceIcon size={15} />}
      </button>
      {toast === null ? null : (
        <Toast
          key={toastSeq}
          text={toast}
          anchor={document.querySelector<HTMLElement>('[data-composer-card]')}
          onDone={() => { setToast(null) }}
        />
      )}
    </>
  )
}

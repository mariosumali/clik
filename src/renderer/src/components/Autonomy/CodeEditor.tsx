import { useEffect, useMemo, useRef, useState } from 'react';
import type { AutonomyFlow } from '../../../../shared/autonomy';
import {
  formatFlow,
  parseFlow,
  type ParseError,
} from '../../../../shared/autonomyDsl';
import { useStore } from '../../store';

interface CodeEditorProps {
  flow: AutonomyFlow;
  running: boolean;
}

// Debounce window for code -> graph reconciliation. Longer than typical
// keystroke cadence so incomplete lines don't churn the graph, short enough
// that the canvas feels live.
const DEBOUNCE_MS = 300;

export function CodeEditor({ flow, running }: CodeEditorProps) {
  const replaceFlow = useStore((s) => s.replaceAutonomyFlow);
  const draft = useStore((s) => s.autonomyCodeDrafts[flow.id]);
  const setDraft = useStore((s) => s.setAutonomyCodeDraft);

  // Canonical rendering of the flow — regenerated whenever the flow identity
  // or contents change.
  const canonical = useMemo(() => formatFlow(flow), [flow]);

  // The text currently in the editor. Starts from the draft if one exists,
  // otherwise the canonical rendering.
  const [text, setText] = useState<string>(draft ?? canonical);

  // Errors from the latest parse attempt (empty when text is valid).
  const [errors, setErrors] = useState<ParseError[]>([]);

  // Tracks whether the local text is out of sync with the canvas because the
  // user is still typing or the text is currently unparseable. When true and
  // the canvas changes underneath, we show a subtle banner instead of
  // clobbering the in-progress edit.
  const [divergedFromFlow, setDivergedFromFlow] = useState<boolean>(
    draft !== undefined && draft !== canonical,
  );

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Captures the canonical text that corresponds to the most recent flow we've
  // written through replaceFlow. Used to detect "graph changed elsewhere"
  // while the user holds an unparseable draft.
  const lastAcceptedCanonicalRef = useRef<string>(canonical);

  // Keep the text in sync with the flow when:
  // - the flow id changes (switching flows)
  // - the canvas edits the flow and the current text is not a dirty draft
  useEffect(() => {
    if (draft === undefined) {
      // No local draft — always show the canonical text for the flow.
      setText(canonical);
      setErrors([]);
      setDivergedFromFlow(false);
      lastAcceptedCanonicalRef.current = canonical;
      return;
    }
    // There is a draft. If the underlying canvas state diverged from what the
    // draft parses to (i.e. someone edited via the graph while the draft was
    // invalid), surface the banner.
    if (canonical !== lastAcceptedCanonicalRef.current) {
      setDivergedFromFlow(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id, canonical]);

  // Cancel the debounce timer on unmount or flow change.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleChange = (next: string) => {
    setText(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (running) {
      // While the runner is live, don't push code->graph changes; the main
      // process expects a stable flow. Still show live errors so typing
      // feedback works.
      const trial = parseFlow(next, flow);
      setErrors(trial.ok ? [] : trial.errors);
      setDraft(flow.id, next);
      setDivergedFromFlow(true);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const result = parseFlow(next, flow);
      if (result.ok) {
        setErrors([]);
        // Avoid unnecessary replacements — compare against canonical.
        const nextCanonical = formatFlow(result.flow);
        if (nextCanonical !== canonical) {
          replaceFlow(flow.id, result.flow);
          lastAcceptedCanonicalRef.current = nextCanonical;
        } else {
          lastAcceptedCanonicalRef.current = canonical;
        }
        // If the user's text exactly matches the new canonical, the draft
        // is redundant; clear it so future canvas edits flow through.
        if (next === nextCanonical) {
          setDraft(flow.id, null);
          setDivergedFromFlow(false);
        } else {
          setDraft(flow.id, next);
          setDivergedFromFlow(true);
        }
      } else {
        setErrors(result.errors);
        setDraft(flow.id, next);
        setDivergedFromFlow(true);
      }
    }, DEBOUNCE_MS);
  };

  const handleRegenerate = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setText(canonical);
    setErrors([]);
    setDraft(flow.id, null);
    setDivergedFromFlow(false);
    lastAcceptedCanonicalRef.current = canonical;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab inserts two spaces so indentation matches the formatter output.
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart, selectionEnd, value } = ta;
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      const insert = '  ';
      const next = before + insert + after;
      setText(next);
      // Schedule caret placement after React commits.
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + insert.length;
      });
      handleChange(next);
    }
  };

  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const jumpTo = (err: ParseError) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < err.line - 1 && i < lines.length; i += 1) {
      offset += lines[i].length + 1;
    }
    offset += Math.max(0, err.col - 1);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = offset;
  };

  const lineCount = useMemo(() => text.split('\n').length, [text]);

  return (
    <div className="h-full w-full flex flex-col" style={{ background: 'var(--color-ink)' }}>
      <div
        className="shrink-0 flex items-center gap-3 px-4 h-[32px] border-b border-[var(--color-line)]"
        style={{ background: 'var(--color-ink-2)' }}
      >
        <span className="label-muted">Code</span>
        {errors.length > 0 && (
          <span className="label-muted" style={{ color: 'var(--color-danger)' }}>
            {errors.length} {errors.length === 1 ? 'issue' : 'issues'}
          </span>
        )}
        {divergedFromFlow && errors.length === 0 && (
          <span className="label-muted" style={{ color: 'var(--color-accent)' }}>
            Draft differs from canvas
          </span>
        )}
        {divergedFromFlow && (
          <button
            type="button"
            className="btn-ghost ml-auto"
            onClick={handleRegenerate}
            title="Replace editor text with the current canvas state"
            disabled={running}
          >
            Regenerate from canvas
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex">
        <div
          ref={gutterRef}
          className="shrink-0 overflow-hidden font-mono text-[12px] py-2"
          style={{
            width: `${String(lineCount).length * 8 + 16}px`,
            color: 'var(--color-muted)',
            background: 'var(--color-ink-2)',
            borderRight: '1px solid var(--color-line)',
            lineHeight: '1.5',
            userSelect: 'none',
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i}
              className="text-right pr-2"
              style={{
                color: errors.some((e) => e.line === i + 1)
                  ? 'var(--color-danger)'
                  : undefined,
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          disabled={running}
          className="flex-1 min-w-0 py-2 px-3 font-mono text-[12px] resize-none outline-none"
          style={{
            background: 'var(--color-ink)',
            color: 'var(--color-cream)',
            lineHeight: '1.5',
            userSelect: 'text',
            WebkitUserSelect: 'text',
            tabSize: 2,
          }}
        />
      </div>

      {errors.length > 0 && (
        <div
          className="shrink-0 max-h-[180px] overflow-y-auto border-t border-[var(--color-line)]"
          style={{ background: 'var(--color-ink-2)' }}
        >
          <div className="px-4 py-2 label-muted">Parse errors</div>
          <ul className="pb-2">
            {errors.map((err, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-1 font-mono text-[12px] hover:bg-[var(--color-ink-3)]"
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() => jumpTo(err)}
                >
                  <span className="text-[var(--color-muted)]">
                    {err.line}:{err.col}
                  </span>{' '}
                  {err.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

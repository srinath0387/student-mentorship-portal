/**
 * NumberedListInput — a textarea that keeps a numbered list:
 *  • focusing an empty box starts "1. "
 *  • Enter adds the next number ("2. ", "3. " …); Enter on an empty point ends the list
 *  • pasting several lines turns each into its own point
 *  • points are renumbered after deleting or moving lines
 * The value stays plain text ("1. …\n2. …"), so PDFs and older records keep working.
 */
import React, { useLayoutEffect, useRef } from 'react';

const ITEM = /^\s*(\d+)[.)]\s?(.*)$/;

export function renumber(text: string): string {
  let n = 0;
  return text.split('\n').map(line => {
    const m = line.match(ITEM);
    if (!m) return line;
    n += 1;
    return `${n}. ${m[2]}`;
  }).join('\n');
}

/** Points of a numbered list as plain strings (numbers and bullets stripped, blanks dropped). */
export function listItems(text: string | null | undefined): string[] {
  return String(text || '').split('\n').map(l => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
}

export function NumberedListInput({ id, value, onChange, rows = 3, placeholder, className = '', disabled }: {
  id?: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; className?: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Caret to restore after React writes the new value. Applied synchronously right after the
  // update (not in a later frame), so fast typing never lands before the new number.
  const pendingCaret = useRef<number | null>(null);
  const setCaret = (pos: number) => { pendingCaret.current = pos; };
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pendingCaret.current != null && document.activeElement === el) {
      const pos = Math.min(pendingCaret.current, el.value.length);
      el.setSelectionRange(pos, pos);
    }
    pendingCaret.current = null;
  }, [value]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    const before = value.slice(0, el.selectionStart);
    const after = value.slice(el.selectionEnd);
    const lineStart = before.lastIndexOf('\n') + 1;
    const line = before.slice(lineStart);
    const m = line.match(ITEM);
    const restOfLine = after.split('\n')[0];
    if (m && !m[2].trim() && !restOfLine.trim()) {
      // Enter on an empty point: end the list
      e.preventDefault();
      const next = value.slice(0, lineStart).replace(/\n$/, '') + after;
      onChange(renumber(next));
      setCaret(Math.max(0, lineStart - 1));
      return;
    }
    if (m || !value.trim()) {
      e.preventDefault();
      const n = m ? Number(m[1]) + 1 : 1;
      const insert = `\n${n}. `;
      onChange(renumber(before + insert + after));
      setCaret(before.length + insert.length);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted.includes('\n')) return;
    e.preventDefault();
    const el = e.currentTarget;
    const before = value.slice(0, el.selectionStart);
    const after = value.slice(el.selectionEnd);
    const lineStart = before.lastIndexOf('\n') + 1;
    const head = before.slice(0, lineStart);
    const current = before.slice(lineStart).replace(ITEM, '$2');
    const items = [current + (listItems(pasted)[0] || ''), ...listItems(pasted).slice(1)].filter(x => x.trim());
    const block = items.map(x => `1. ${x}`).join('\n');
    const next = renumber(head + block + after);
    onChange(next);
    setCaret(next.length - after.length);
  };

  return (
    <div className="space-y-0.5">
      <textarea
        id={id}
        ref={ref}
        rows={Math.min(16, Math.max(rows, value.split('\n').length + 1))}
        disabled={disabled}
        className={className}
        placeholder={placeholder || '1. …'}
        value={value}
        onFocus={() => { if (!value.trim() && !disabled) { onChange('1. '); setCaret(3); } }}
        onBlur={() => { if (/^\s*1\.\s*$/.test(value)) onChange(''); }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onChange={e => onChange(renumber(e.target.value))}
      />
      {!disabled && <p className="text-[10px] text-textMuted">Press Enter for the next point · Enter on an empty point ends the list</p>}
    </div>
  );
}

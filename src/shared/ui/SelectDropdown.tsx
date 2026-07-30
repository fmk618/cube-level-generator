import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectDropdownProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  size?: 'md' | 'sm';
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
}

interface MenuPos {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
}

export function SelectDropdown({
  value,
  options,
  onChange,
  placeholder = '请选择...',
  size = 'md',
  className = '',
  disabled = false,
  searchable = false,
}: SelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder;
  const isPlaceholder = !selected;

  const filtered = searchable && query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(260, Math.max(140, available));
    // Exact trigger box — never min-widen (that made the panel look shifted right).
    const width = rect.width;
    let left = rect.left;
    const overflowRight = left + width - (window.innerWidth - 8);
    if (overflowRight > 0) left = Math.max(8, left - overflowRight);
    setPos({
      top: openUp ? rect.top - gap : rect.bottom + gap,
      left,
      width,
      maxHeight,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    // Remeasure after paint — autofocus/layout can shift scroll containers.
    const raf = window.requestAnimationFrame(() => {
      updatePos();
      window.requestAnimationFrame(updatePos);
    });
    const onScrollOrResize = () => updatePos();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !searchable) return;
    // preventScroll avoids shifting the trigger while the fixed menu stays put.
    searchRef.current?.focus({ preventScroll: true });
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const menu = open && pos
    ? createPortal(
        <div
          ref={menuRef}
          className="ui-select-menu"
          role="listbox"
          id={listId}
          style={{
            position: 'fixed',
            top: pos.openUp ? undefined : pos.top,
            bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
            zIndex: 9999,
          }}
        >
          {searchable && (
            <div className="ui-select-search">
              <input
                ref={searchRef}
                className="ui-select-search-input"
                placeholder="搜索..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <ul
            className="ui-select-list"
            style={{ maxHeight: searchable ? Math.max(80, pos.maxHeight - 52) : pos.maxHeight }}
          >
            {filtered.length === 0 ? (
              <li className="ui-select-empty">无匹配项</li>
            ) : (
              filtered.map((opt) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  className={`ui-select-option ${opt.value === value ? 'is-active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt.value);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <span className="ui-select-option-label">{opt.label}</span>
                  {opt.value === value && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      ref={rootRef}
      className={`ui-select ${size === 'sm' ? 'ui-select--sm' : ''} ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`ui-select-trigger ${isPlaceholder ? 'is-placeholder' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          setQuery('');
        }}
      >
        <span className="ui-select-label">{displayLabel}</span>
        <svg className="ui-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {menu}
    </div>
  );
}

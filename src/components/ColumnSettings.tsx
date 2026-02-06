'use client';

import { useState, useRef, useEffect } from 'react';

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
}

interface ColumnSettingsProps {
  columns: ColumnConfig[];
  onChange: (columns: ColumnConfig[]) => void;
  onReset?: () => void;
}

export default function ColumnSettings({ columns, onChange, onReset }: ColumnSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggleColumn(key: string) {
    const updated = columns.map((col) =>
      col.key === key ? { ...col, visible: !col.visible } : col,
    );
    onChange(updated);
  }

  function showAll() {
    onChange(columns.map((col) => ({ ...col, visible: true })));
  }

  function hideAll() {
    onChange(columns.map((col) => ({ ...col, visible: false })));
  }

  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-sm bg-[var(--bg-tertiary)] hover:opacity-80 rounded-lg flex items-center gap-2 text-[var(--text-secondary)]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
        </svg>
        Columns ({visibleCount})
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-xl z-50 min-w-[200px]">
          <div className="p-2 border-b border-[var(--border-color)] flex gap-2">
            <button
              onClick={showAll}
              className="flex-1 px-2 py-1 text-xs bg-[var(--accent-primary)] text-white rounded hover:opacity-80"
            >
              Show All
            </button>
            <button
              onClick={hideAll}
              className="flex-1 px-2 py-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded hover:opacity-80"
            >
              Hide All
            </button>
            {onReset && (
              <button
                onClick={() => { onReset(); setIsOpen(false); }}
                className="flex-1 px-2 py-1 text-xs bg-[var(--accent-orange)] text-white rounded hover:opacity-80"
                title="Reset to default columns"
              >
                Reset
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {columns.map((col) => (
              <label
                key={col.key}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)] rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => toggleColumn(col.key)}
                  className="rounded"
                />
                <span className="text-sm text-[var(--text-primary)]">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

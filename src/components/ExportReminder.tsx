'use client';

import { useState, useEffect } from 'react';

const REMINDER_KEY = 'lastExportReminderDismissed';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface ExportReminderProps {
  onExport: () => void;
}

export default function ExportReminder({ onExport }: ExportReminderProps) {
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    const lastDismissed = localStorage.getItem(REMINDER_KEY);
    const now = Date.now();

    if (!lastDismissed) {
      // First time - show reminder
      setShowReminder(true);
    } else {
      const lastTime = parseInt(lastDismissed, 10);
      if (now - lastTime >= WEEK_MS) {
        // More than a week since last dismissed
        setShowReminder(true);
      }
    }
  }, []);

  function handleDismiss() {
    localStorage.setItem(REMINDER_KEY, Date.now().toString());
    setShowReminder(false);
  }

  function handleExportAndDismiss() {
    onExport();
    handleDismiss();
  }

  if (!showReminder) return null;

  return (
    <div className="export-reminder">
      <div className="flex items-center gap-3">
        <span className="text-xl">🌻</span>
        <span>
          <strong>Weekly backup reminder:</strong> Export your data to CSV to keep a local backup of your stocks.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={handleExportAndDismiss}>
          Export Now
        </button>
        <button onClick={handleDismiss} style={{ background: 'transparent' }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

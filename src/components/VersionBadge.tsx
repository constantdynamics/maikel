'use client';

import packageJson from '../../package.json';

export default function VersionBadge() {
  return (
    <div
      className="fixed bottom-2 left-4 z-30 text-sm font-mono font-extrabold"
      style={{ color: 'var(--accent-primary)' }}
    >
      v{packageJson.version}
    </div>
  );
}

'use client';

import packageJson from '../../package.json';

export default function VersionBadge() {
  return (
    <div
      className="fixed bottom-2 left-4 z-30 text-[10px] font-mono"
      style={{ color: '#555' }}
    >
      v{packageJson.version}
    </div>
  );
}

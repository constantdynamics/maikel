'use client';

import { useState } from 'react';

type TabType = 'kuifje' | 'zonnebloem' | 'biopharma' | 'mining';

interface ColumnLegendProps {
  activeTab: TabType;
}

function DotSample({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full border border-gray-600"
      style={{ backgroundColor: color }}
    />
  );
}

const kuifjeColumns = [
  { name: 'Events', desc: 'Aantal keer dat de prijs explosief is gestegen (growth events). Gesorteerd als medaillespiegel.' },
  { name: 'Growth', desc: 'Gekleurde bolletjes die de grootte van elke growth event weergeven.' },
  { name: 'Top Growth', desc: 'Hoogste growth event percentage van alle events.' },
  { name: 'Score', desc: 'Regenboog-score van 0-10 op basis van meerdere factoren (ATH-daling, events, volume, etc.).' },
  { name: 'ATH%', desc: 'Hoeveel procent de huidige prijs onder de All-Time High zit.' },
  { name: 'Price', desc: 'Huidige koers van het aandeel.' },
  { name: 'ATH', desc: 'All-Time High prijs ooit bereikt.' },
  { name: 'Detected', desc: 'Datum waarop dit aandeel voor het eerst door de scanner is gevonden.' },
  { name: 'Scan #', desc: 'Welke scan-sessie dit aandeel heeft gevonden (datum + volgnummer).' },
  { name: 'Stable+Spike', desc: 'Aandelen met een stabiele basis (max 30% daling in 12m) maar wel een flinke spike.' },
];

const zonnebloemColumns = [
  { name: 'Spikes', desc: 'Gekleurde bolletjes die het aantal en de grootte van prijsspikes weergeven. Gesorteerd als medaillespiegel.' },
  { name: 'Max Spike %', desc: 'Hoogste spike percentage ooit gemeten boven de basislijn.' },
  { name: 'Price', desc: 'Huidige koers van het aandeel.' },
  { name: 'Base Price', desc: 'Mediaan basisprijs waar het aandeel normaal rond zweeft.' },
  { name: '12m Change', desc: 'Prijsverandering over de afgelopen 12 maanden.' },
  { name: 'Volume 30d', desc: 'Gemiddeld dagelijks handelsvolume over 30 dagen.' },
  { name: 'Spike Score', desc: 'Regenboog-score van 0-10 specifiek voor spike-kwaliteit.' },
  { name: 'Detected', desc: 'Datum waarop dit aandeel voor het eerst door de Zonnebloem scanner is gevonden.' },
  { name: 'Scan # / Scan Time', desc: 'Welke scan-sessie dit aandeel heeft gevonden.' },
];

const sectorColumns = [
  { name: 'Match', desc: 'K = gevonden door Kuifje, Z = gevonden door Zonnebloem, K+Z = gevonden door beide scanners.' },
  { name: 'Spikes', desc: 'Bolletjes voor spike events (Zonnebloem-criteria). Gesorteerd als medaillespiegel.' },
  { name: 'Growth', desc: 'Bolletjes voor growth events (Kuifje-criteria). Gesorteerd als medaillespiegel.' },
  { name: 'Top Spike', desc: 'Hoogste spike percentage boven de basislijn.' },
  { name: 'Top Growth', desc: 'Hoogste growth event percentage.' },
  { name: 'Score', desc: 'Regenboog-score van 0-10.' },
  { name: 'ATH%', desc: 'Hoeveel procent onder de All-Time High.' },
  { name: 'Price', desc: 'Huidige koers.' },
  { name: 'Detected', desc: 'Datum van eerste detectie.' },
];

export default function ColumnLegend({ activeTab }: ColumnLegendProps) {
  const [open, setOpen] = useState(false);

  const columns = activeTab === 'kuifje' ? kuifjeColumns
    : activeTab === 'zonnebloem' ? zonnebloemColumns
    : sectorColumns;

  const isKuifje = activeTab === 'kuifje';
  const isZonnebloem = activeTab === 'zonnebloem';
  const isSector = activeTab === 'biopharma' || activeTab === 'mining';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
          open
            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-color)] hover:text-[var(--text-secondary)]'
        }`}
        title="Kolom uitleg"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Uitleg
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[420px] max-h-[70vh] overflow-y-auto bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-2xl">
          <div className="sticky top-0 bg-[var(--card-bg)] border-b border-[var(--border-color)] px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Kolom uitleg — {activeTab === 'kuifje' ? 'Kuifje' : activeTab === 'zonnebloem' ? 'Zonnebloem' : activeTab === 'biopharma' ? 'BioPharma' : 'Mining'}
            </span>
            <button onClick={() => setOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              &#x2715;
            </button>
          </div>

          {/* Dot legend */}
          <div className="px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)]">
            <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Medaillespiegel bolletjes
            </div>
            <div className="text-xs text-[var(--text-muted)] mb-2">
              Sortering werkt als de Olympische medaillespiegel: eerst op goud (groen), dan zilver (geel), dan brons (wit).
            </div>

            {(isKuifje || isSector) && (
              <div className="mb-2">
                <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">Growth events (Kuifje):</div>
                <div className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1.5"><DotSample color="#22c55e" /> Groen = groei van 500% of meer</span>
                  <span className="flex items-center gap-1.5"><DotSample color="#facc15" /> Geel = groei van 300% - 500%</span>
                  <span className="flex items-center gap-1.5"><DotSample color="#ffffff" /> Wit = groei onder 300%</span>
                </div>
              </div>
            )}

            {(isZonnebloem || isSector) && (
              <div>
                <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">Spike events (Zonnebloem):</div>
                <div className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1.5"><DotSample color="#22c55e" /> Groen = spike van 200% of meer</span>
                  <span className="flex items-center gap-1.5"><DotSample color="#facc15" /> Geel = spike van 100% - 200%</span>
                  <span className="flex items-center gap-1.5"><DotSample color="#ffffff" /> Wit = spike onder 100%</span>
                </div>
              </div>
            )}
          </div>

          {/* Column descriptions */}
          <div className="px-4 py-3">
            <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Kolommen
            </div>
            <div className="space-y-2">
              {columns.map((col) => (
                <div key={col.name}>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">{col.name}</span>
                  <span className="text-xs text-[var(--text-muted)]"> — {col.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

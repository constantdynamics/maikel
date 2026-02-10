'use client';

import type { ZonnebloemStock } from '@/lib/types';
import { ALL_ZB_COLUMNS, type ScanSessionInfo } from '@/hooks/useZonnebloemStocks';
import { spikeDotsSortValue } from './ZonnebloemTable';

interface Props {
  stocks: ZonnebloemStock[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  scanSessions: Map<string, ScanSessionInfo>;
  visibleColumns: Set<string>;
}

function fmt(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined) return '';
  return val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return '';
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
}

function fmtVol(val: number | null | undefined): string {
  if (val === null || val === undefined) return '';
  if (val >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
  return String(val);
}

function dotsText(stock: ZonnebloemStock): string {
  const count = Math.min(stock.spike_count, 10);
  if (count === 0) return '-';
  const highest = stock.highest_spike_pct || 75;
  const avg = highest / Math.max(stock.spike_count, 1);
  let g = 0, y = 0, w = 0;
  for (let i = 0; i < count; i++) {
    const est = i === 0 ? highest : avg * (1 - i * 0.08);
    if (est >= 200) g++;
    else if (est >= 100) y++;
    else w++;
  }
  const parts = [];
  if (g) parts.push(`${g}G`);
  if (y) parts.push(`${y}Y`);
  if (w) parts.push(`${w}W`);
  return parts.join(' ');
}

function getCellValue(stock: ZonnebloemStock, key: string, session: ScanSessionInfo | null): string {
  switch (key) {
    case 'ticker': return stock.ticker;
    case 'company_name': return stock.company_name || '';
    case 'market': return stock.market || '';
    case 'current_price': return fmt(stock.current_price);
    case 'base_price_median': return fmt(stock.base_price_median);
    case 'spike_dots': return dotsText(stock);
    case 'spike_score': return String(Math.round(stock.spike_score));
    case 'highest_spike_pct': return stock.highest_spike_pct !== null ? `+${stock.highest_spike_pct.toFixed(0)}%` : '';
    case 'price_change_12m_pct': return fmtPct(stock.price_change_12m_pct);
    case 'avg_volume_30d': return fmtVol(stock.avg_volume_30d);
    case 'market_cap': return fmtVol(stock.market_cap);
    case 'sector': return stock.sector || '';
    case 'country': return stock.country || '';
    case 'scan_number': return session ? `#${session.dailyNumber}` : '';
    case 'scan_time': return session ? `${session.date.slice(5)} ${session.time}` : '';
    case 'detection_date': return stock.detection_date ? new Date(stock.detection_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
    default: return String(stock[key as keyof ZonnebloemStock] ?? '');
  }
}

const NUM_COLS = new Set(['current_price', 'base_price_median', 'spike_score', 'highest_spike_pct', 'price_change_12m_pct', 'avg_volume_30d', 'market_cap']);

export default function ZonnebloemExcelView({
  stocks,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  scanSessions,
  visibleColumns,
}: Props) {
  const cols = ALL_ZB_COLUMNS.filter(c => visibleColumns.has(c.key));

  return (
    <div className="overflow-x-auto border border-[#4a7c4a]" style={{ fontFamily: 'Calibri, Arial, sans-serif', fontSize: '12px' }}>
      <table className="w-full border-collapse" style={{ background: '#fff', color: '#000' }}>
        <thead>
          <tr>
            <th className="excel-th" style={thStyle}>
              <input
                type="checkbox"
                checked={stocks.length > 0 && selectedIds.size === stocks.length}
                onChange={onToggleSelectAll}
              />
            </th>
            {cols.map((col, i) => (
              <th key={col.key} style={{ ...thStyle, textAlign: NUM_COLS.has(col.key) ? 'right' : 'left' }}>
                {colLetter(i + 1)}
              </th>
            ))}
          </tr>
          <tr>
            <th style={{ ...thStyle, width: 30 }}></th>
            {cols.map(col => (
              <th key={col.key} style={{
                ...thStyle,
                textAlign: NUM_COLS.has(col.key) ? 'right' : 'left',
                fontWeight: 700,
                color: '#1a3a1a',
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock, rowIdx) => {
            const session = stock.scan_session_id ? scanSessions.get(stock.scan_session_id) || null : null;
            const isSelected = selectedIds.has(stock.id);

            return (
              <tr
                key={stock.id}
                onClick={() => onToggleSelect(stock.id)}
                style={{
                  background: isSelected ? '#cde4f7' : rowIdx % 2 === 0 ? '#ffffff' : '#f2f2f2',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#e8f0fe'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = rowIdx % 2 === 0 ? '#ffffff' : '#f2f2f2'; }}
              >
                <td style={{ ...cellStyle, textAlign: 'center', width: 30 }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(stock.id)}
                  />
                </td>
                {cols.map(col => {
                  const val = getCellValue(stock, col.key, session);
                  const isNum = NUM_COLS.has(col.key);
                  let color = '#000';

                  if (col.key === 'price_change_12m_pct' && stock.price_change_12m_pct !== null) {
                    color = stock.price_change_12m_pct >= 0 ? '#1a7a1a' : '#cc2222';
                  }
                  if (col.key === 'highest_spike_pct' && stock.highest_spike_pct !== null) {
                    color = stock.highest_spike_pct >= 200 ? '#1a7a1a' : stock.highest_spike_pct >= 100 ? '#b38600' : '#000';
                  }
                  if (col.key === 'spike_dots') {
                    color = '#333';
                  }
                  if (col.key === 'ticker') {
                    return (
                      <td key={col.key} style={{ ...cellStyle, fontWeight: 700 }}>
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(stock.ticker + ' stock')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: '#0563C1', textDecoration: 'underline' }}
                        >
                          {stock.ticker}
                        </a>
                      </td>
                    );
                  }

                  return (
                    <td key={col.key} style={{
                      ...cellStyle,
                      textAlign: isNum ? 'right' : 'left',
                      color,
                      fontWeight: col.key === 'spike_dots' ? 600 : 400,
                    }}>
                      {val}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {stocks.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#666', background: '#fff' }}>
          No data
        </div>
      )}
    </div>
  );
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

const thStyle: React.CSSProperties = {
  padding: '3px 6px',
  background: '#e2efda',
  border: '1px solid #a9c98d',
  fontSize: '11px',
  color: '#375623',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const cellStyle: React.CSSProperties = {
  padding: '2px 6px',
  border: '1px solid #d4d4d4',
  whiteSpace: 'nowrap',
  maxWidth: 200,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

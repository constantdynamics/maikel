'use client';

import { useCallback, useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils';
import type { Stock } from '@/lib/types';

export default function RecycleBinPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  const fetchDeleted = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('stocks')
      .select('*')
      .eq('is_deleted', true)
      .order('deleted_at', { ascending: false });

    if (data) setStocks(data as Stock[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDeleted();
  }, [fetchDeleted]);

  async function restoreStock(id: string) {
    const { error } = await supabase
      .from('stocks')
      .update({ is_deleted: false, deleted_at: null })
      .eq('id', id);

    if (!error) {
      setStocks((prev) => prev.filter((s) => s.id !== id));
    }
  }

  async function permanentlyDelete(id: string) {
    const stock = stocks.find((s) => s.id === id);
    if (!stock) return;

    await supabase.from('price_history').delete().eq('ticker', stock.ticker);
    await supabase.from('growth_events').delete().eq('ticker', stock.ticker);
    await supabase.from('stocks').delete().eq('id', id);

    setStocks((prev) => prev.filter((s) => s.id !== id));
  }

  async function restoreAll() {
    const ids = stocks.map((s) => s.id);
    const { error } = await supabase
      .from('stocks')
      .update({ is_deleted: false, deleted_at: null })
      .in('id', ids);

    if (!error) setStocks([]);
  }

  async function emptyBin() {
    for (const stock of stocks) {
      await supabase.from('price_history').delete().eq('ticker', stock.ticker);
      await supabase.from('growth_events').delete().eq('ticker', stock.ticker);
    }
    await supabase.from('stocks').delete().eq('is_deleted', true);
    setStocks([]);
  }

  function requestEmptyBin() {
    setConfirmDialog({
      open: true,
      title: 'Empty recycle bin?',
      message: `All ${stocks.length} stock${stocks.length !== 1 ? 's' : ''} and their price history will be permanently deleted. This cannot be undone.`,
      onConfirm: () => {
        emptyBin();
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  }

  function requestPermanentDelete(id: string) {
    const stock = stocks.find((s) => s.id === id);
    setConfirmDialog({
      open: true,
      title: `Permanently delete ${stock?.ticker || 'stock'}?`,
      message: 'This stock and all its price history will be permanently deleted. This cannot be undone.',
      onConfirm: () => {
        permanentlyDelete(id);
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Recycle Bin</h1>
          {stocks.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={restoreAll}
                className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              >
                Restore All
              </button>
              <button
                onClick={requestEmptyBin}
                className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 rounded transition-colors"
              >
                Empty Bin
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-slate-400 py-8 text-center">Loading...</div>
        ) : stocks.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
            <div className="text-slate-400">Recycle bin is empty</div>
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Ticker</th>
                    <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Company</th>
                    <th className="px-4 py-3 text-right text-xs uppercase text-slate-300">Price</th>
                    <th className="px-4 py-3 text-right text-xs uppercase text-slate-300">ATH%</th>
                    <th className="px-4 py-3 text-right text-xs uppercase text-slate-300">Score</th>
                    <th className="px-4 py-3 text-left text-xs uppercase text-slate-300">Deleted</th>
                    <th className="px-4 py-3 text-center text-xs uppercase text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {stocks.map((stock) => (
                    <tr key={stock.id} className="hover:bg-slate-700/30">
                      <td className="px-4 py-3 font-mono font-semibold text-blue-400">
                        {stock.ticker}
                      </td>
                      <td className="px-4 py-3">{stock.company_name}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatCurrency(stock.current_price)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatPercent(stock.ath_decline_pct)}
                      </td>
                      <td className="px-4 py-3 text-right">{stock.score}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {formatDate(stock.deleted_at)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => restoreStock(stock.id)}
                            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => requestPermanentDelete(stock.id)}
                            className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded transition-colors"
                          >
                            Delete Forever
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-slate-700/30 text-sm text-slate-400">
              {stocks.length} deleted item{stocks.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        <ConfirmDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel="Delete Permanently"
          variant="danger"
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        />
      </div>
    </>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { PlusIcon, Cog6ToothIcon, ChevronUpIcon, ChevronDownIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import type { Tab, FixedTabColors } from '@/lib/defog/types';
import { SCANNER_TAB_NAMES } from '@/lib/defog/scannerSync';
import { Modal } from './Modal';

const SCANNER_TAB_SET = new Set<string>(SCANNER_TAB_NAMES);

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onAddTab: (name: string, color: string) => void;
  onEditTab: (tabId: string, name: string, color: string) => void;
  onDeleteTab: (tabId: string) => void;
  fixedTabColors?: FixedTabColors;
  allStockCount?: number;
  purchasedStockCount?: number;
  hiddenTabIds: string[];
  onToggleTabVisibility: (tabId: string) => void;
}

const ACCENT_COLORS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#00ff88', // Green (brand)
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
];

// Minimum width for tabs (enough for ~20 characters)
const TAB_MIN_WIDTH = '240px';

// Default fixed tab colors
const DEFAULT_FIXED_COLORS: FixedTabColors = {
  all: 'rainbow',
  topGainers: '#00ff88',
  topLosers: '#ff3366',
  purchased: '#00ff88',
};

export function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onAddTab,
  onEditTab,
  onDeleteTab,
  fixedTabColors = DEFAULT_FIXED_COLORS,
  allStockCount = 0,
  purchasedStockCount = 0,
  hiddenTabIds,
  onToggleTabVisibility,
}: TabBarProps) {
  // Merge with defaults to ensure all colors are present
  const colors = { ...DEFAULT_FIXED_COLORS, ...fixedTabColors };
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTab, setEditingTab] = useState<Tab | null>(null);
  const [newTabName, setNewTabName] = useState('');
  const [newTabColor, setNewTabColor] = useState(ACCENT_COLORS[0]);
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  const visMenuRef = useRef<HTMLDivElement>(null);

  // Close visibility menu on outside click
  useEffect(() => {
    if (!showVisibilityMenu) return;
    const handler = (e: MouseEvent) => {
      if (visMenuRef.current && !visMenuRef.current.contains(e.target as Node)) {
        setShowVisibilityMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVisibilityMenu]);

  // Split tabs into scanner tabs and user tabs
  const scannerTabs = tabs.filter((t) => SCANNER_TAB_SET.has(t.name));
  const userTabs = tabs.filter((t) => !SCANNER_TAB_SET.has(t.name));

  const hiddenSet = new Set(hiddenTabIds);
  const visibleUserTabs = userTabs.filter((t) => !hiddenSet.has(t.id));
  const visibleScannerTabs = scannerTabs.filter((t) => !hiddenSet.has(t.id));

  const handleAddTab = () => {
    if (newTabName.trim()) {
      onAddTab(newTabName.trim(), newTabColor);
      setNewTabName('');
      setNewTabColor(ACCENT_COLORS[0]);
      setShowAddModal(false);
    }
  };

  const handleEditTab = () => {
    if (editingTab && newTabName.trim()) {
      onEditTab(editingTab.id, newTabName.trim(), newTabColor);
      setEditingTab(null);
      setNewTabName('');
      setNewTabColor(ACCENT_COLORS[0]);
      setShowEditModal(false);
    }
  };

  const handleDeleteTab = () => {
    if (editingTab && tabs.length > 1) {
      onDeleteTab(editingTab.id);
      setEditingTab(null);
      setShowEditModal(false);
    }
  };

  const openEditModal = (tab: Tab) => {
    setEditingTab(tab);
    setNewTabName(tab.name);
    setNewTabColor(tab.accentColor);
    setShowEditModal(true);
  };

  const renderTabButton = (tab: Tab) => {
    const isActive = activeTabId === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => onTabSelect(tab.id)}
        onDoubleClick={() => openEditModal(tab)}
        className={`flex flex-col items-center justify-center px-4 py-2 rounded-lg transition-all ${
          isActive
            ? 'text-white shadow-md'
            : 'bg-transparent hover:bg-white/5'
        }`}
        style={{
          minWidth: TAB_MIN_WIDTH,
          backgroundColor: isActive ? tab.accentColor : 'transparent',
          border: isActive ? 'none' : `2px solid ${tab.accentColor}`,
          color: isActive ? 'white' : tab.accentColor,
        }}
      >
        <span className="text-sm font-bold">{tab.name}</span>
        <span className="flex items-center gap-1 text-xs opacity-80">
          {isActive && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(tab);
              }}
              className="p-0.5 rounded hover:bg-black/20 transition-colors cursor-pointer"
            >
              <Cog6ToothIcon className="w-3.5 h-3.5" />
            </span>
          )}
          ({tab.stocks.length})
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="space-y-2">
        {/* Row 1: Fixed tabs (Alles, Top, Gekocht) + Visibility toggle */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
        {/* "All" overview tab - Custom color or Rainbow style */}
        <button
          onClick={() => onTabSelect('__all__')}
          className={`flex flex-col items-center justify-center px-4 py-2 rounded-lg transition-all ${
            activeTabId === '__all__'
              ? 'text-white shadow-lg'
              : colors.all === 'rainbow'
                ? 'bg-transparent hover:bg-white/5 border-2 border-dashed border-gray-500 text-gray-400'
                : 'bg-transparent hover:bg-white/5 border-2 border-dashed'
          }`}
          style={{
            minWidth: TAB_MIN_WIDTH,
            background: activeTabId === '__all__'
              ? colors.all === 'rainbow'
                ? 'linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #8b00ff)'
                : colors.all
              : undefined,
            borderColor: colors.all !== 'rainbow' && activeTabId !== '__all__' ? colors.all : undefined,
            color: colors.all !== 'rainbow' && activeTabId !== '__all__' ? colors.all : undefined,
          }}
        >
          <span className="text-sm font-bold">{colors.all === 'rainbow' ? '🌈' : '📋'} Alles</span>
          <span className="text-xs opacity-80">({allStockCount})</span>
        </button>

        {/* "Top Movers" tab - Custom colors split */}
        <button
          onClick={() => onTabSelect('__topmovers__')}
          className={`flex items-center justify-center px-0 py-0 rounded-lg whitespace-nowrap transition-all overflow-hidden ${
            activeTabId === '__topmovers__'
              ? 'shadow-lg'
              : 'bg-transparent hover:bg-white/5 border-2 border-dashed border-gray-500'
          }`}
          style={{ minWidth: TAB_MIN_WIDTH }}
        >
          {activeTabId === '__topmovers__' ? (
            <div className="flex w-full h-full">
              <div className="flex-1 flex items-center justify-center py-2.5 px-2" style={{ backgroundColor: colors.topGainers }}>
                <ChevronUpIcon className="w-4 h-4 text-white" strokeWidth={3} />
              </div>
              <div className="flex-1 flex items-center justify-center py-2.5 px-2" style={{ backgroundColor: colors.topLosers }}>
                <ChevronDownIcon className="w-4 h-4 text-white" strokeWidth={3} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1 py-2.5 px-4 text-gray-400">
              <span style={{ color: colors.topGainers }}>↑</span>
              <span className="text-sm font-bold">Top</span>
              <span style={{ color: colors.topLosers }}>↓</span>
            </div>
          )}
        </button>

        {/* "Purchased" tab - For stocks bought above limit */}
        <button
          onClick={() => onTabSelect('__purchased__')}
          className={`flex flex-col items-center justify-center px-4 py-2 rounded-lg transition-all ${
            activeTabId === '__purchased__'
              ? 'text-white shadow-lg'
              : 'bg-transparent hover:bg-white/5 border-2 border-dashed'
          }`}
          style={{
            minWidth: TAB_MIN_WIDTH,
            backgroundColor: activeTabId === '__purchased__' ? colors.purchased : undefined,
            borderColor: activeTabId !== '__purchased__' ? `${colors.purchased}80` : undefined,
            color: activeTabId !== '__purchased__' ? `${colors.purchased}b3` : undefined,
          }}
        >
          <span className="text-sm font-bold">💰 Gekocht</span>
          <span className="text-xs opacity-80">({purchasedStockCount})</span>
        </button>

        {/* Visibility toggle button */}
        <div className="relative ml-auto" ref={visMenuRef}>
          <button
            onClick={() => setShowVisibilityMenu(!showVisibilityMenu)}
            className={`flex items-center gap-1 px-3 py-2.5 rounded-lg transition-colors ${
              showVisibilityMenu
                ? 'bg-[#2d2d2d] text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
            }`}
            title="Tabbladen zichtbaarheid"
          >
            <EyeIcon className="w-4 h-4" />
          </button>

          {showVisibilityMenu && (
            <div className="absolute right-0 top-full mt-1 w-64 rounded-lg shadow-xl z-50"
              style={{ backgroundColor: '#222', border: '1px solid #3d3d3d' }}
            >
              <div className="p-2">
                {/* Scanner tabs section */}
                {scannerTabs.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                      Scanner tabs
                    </div>
                    {scannerTabs.map((tab) => {
                      const isHidden = hiddenSet.has(tab.id);
                      return (
                        <button
                          key={tab.id}
                          onClick={() => onToggleTabVisibility(tab.id)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
                        >
                          {isHidden ? (
                            <EyeSlashIcon className="w-4 h-4 text-gray-500" />
                          ) : (
                            <EyeIcon className="w-4 h-4 text-white" />
                          )}
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tab.accentColor }}
                          />
                          <span className={`text-sm ${isHidden ? 'text-gray-500' : 'text-white'}`}>
                            {tab.name}
                          </span>
                          <span className="text-xs text-gray-500 ml-auto">({tab.stocks.length})</span>
                        </button>
                      );
                    })}
                  </>
                )}

                {/* User tabs section */}
                {userTabs.length > 0 && (
                  <>
                    <div className="px-2 py-1 mt-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold border-t border-[#3d3d3d]">
                      Eigen tabs
                    </div>
                    {userTabs.map((tab) => {
                      const isHidden = hiddenSet.has(tab.id);
                      return (
                        <button
                          key={tab.id}
                          onClick={() => onToggleTabVisibility(tab.id)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
                        >
                          {isHidden ? (
                            <EyeSlashIcon className="w-4 h-4 text-gray-500" />
                          ) : (
                            <EyeIcon className="w-4 h-4 text-white" />
                          )}
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tab.accentColor }}
                          />
                          <span className={`text-sm ${isHidden ? 'text-gray-500' : 'text-white'}`}>
                            {tab.name}
                          </span>
                          <span className="text-xs text-gray-500 ml-auto">({tab.stocks.length})</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Row 2: User-created tabs (filtered by visibility) */}
        {visibleUserTabs.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
          {visibleUserTabs.map(renderTabButton)}

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-[#2d2d2d] rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="text-sm">New Tab</span>
          </button>
        </div>
        )}

        {/* Show New Tab button alone if no user tabs visible */}
        {visibleUserTabs.length === 0 && (
        <div className="flex items-center gap-2 pb-1">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-[#2d2d2d] rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="text-sm">New Tab</span>
          </button>
        </div>
        )}

        {/* Row 3: Scanner tabs (filtered by visibility) */}
        {visibleScannerTabs.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-[#3d3d3d] scrollbar-track-transparent">
          {visibleScannerTabs.map(renderTabButton)}
        </div>
        )}
      </div>

      {/* Add Tab Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Create New Tab"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Tab Name</label>
            <input
              type="text"
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              placeholder="e.g., Tech Stocks"
              className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Accent Color
            </label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewTabColor(color)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    newTabColor === color ? 'scale-110 ring-2 ring-white' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleAddTab}
            disabled={!newTabName.trim()}
            className="w-full py-2 bg-[#00ff88] hover:bg-[#00dd77] disabled:bg-[#3d3d3d] disabled:text-gray-500 text-black font-medium rounded-lg transition-colors"
          >
            Create Tab
          </button>
        </div>
      </Modal>

      {/* Edit Tab Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Tab"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Tab Name</label>
            <input
              type="text"
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg py-2 px-4 text-white focus:outline-none focus:border-white/30"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Accent Color
            </label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewTabColor(color)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    newTabColor === color ? 'scale-110 ring-2 ring-white' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleEditTab}
              disabled={!newTabName.trim()}
              className="flex-1 py-2 bg-[#00ff88] hover:bg-[#00dd77] disabled:bg-[#3d3d3d] disabled:text-gray-500 text-black font-medium rounded-lg transition-colors"
            >
              Save Changes
            </button>
            {tabs.length > 1 && (
              <button
                onClick={handleDeleteTab}
                className="px-4 py-2 bg-[#3d3d3d] hover:bg-[#ff3366] text-gray-400 hover:text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

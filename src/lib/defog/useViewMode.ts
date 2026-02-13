import { useState, useEffect, useCallback } from 'react';
import type { ViewMode } from './types';

const MOBILE_BREAKPOINT = 768; // pixels

export interface UseViewModeResult {
  // Current effective view (what's actually shown)
  isMobileView: boolean;
  // User's preference
  viewMode: ViewMode;
  // Detected device type
  isActuallyMobile: boolean;
  // Actions
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
}

export function useViewMode(savedViewMode: ViewMode = 'auto'): UseViewModeResult {
  const [viewMode, setViewModeState] = useState<ViewMode>(savedViewMode);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  // Track window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync with saved preference
  useEffect(() => {
    setViewModeState(savedViewMode);
  }, [savedViewMode]);

  // Detect actual device type based on window width
  const isActuallyMobile = windowWidth < MOBILE_BREAKPOINT;

  // Determine effective view based on mode and device
  const isMobileView = viewMode === 'auto'
    ? isActuallyMobile
    : viewMode === 'mobile';

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewModeState(current => {
      if (current === 'auto') {
        // If auto, switch to opposite of current detection
        return isActuallyMobile ? 'desktop' : 'mobile';
      } else if (current === 'mobile') {
        return 'desktop';
      } else {
        return 'mobile';
      }
    });
  }, [isActuallyMobile]);

  return {
    isMobileView,
    viewMode,
    isActuallyMobile,
    setViewMode,
    toggleViewMode,
  };
}

// Helper to get view mode icon based on current state
export function getViewModeIcon(viewMode: ViewMode, isMobileView: boolean): 'mobile' | 'desktop' | 'auto' {
  if (viewMode === 'auto') return 'auto';
  return isMobileView ? 'mobile' : 'desktop';
}

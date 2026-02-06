'use client';

import { useState, useEffect } from 'react';
import packageJson from '../../package.json';

const APP_VERSION = packageJson.version;

export default function FixedUI() {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 300);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      {/* Version badge - bottom left */}
      <div className="fixed-version">
        <span className="text-[var(--accent-primary)]">v{APP_VERSION}</span>
        <span className="ml-2 opacity-60">Professor Zonnebloem</span>
      </div>

      {/* Scroll to top button - bottom right */}
      <button
        onClick={scrollToTop}
        className={`scroll-to-top ${showScrollTop ? 'visible' : ''}`}
        aria-label="Scroll to top"
      >
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </button>
    </>
  );
}

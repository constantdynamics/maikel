import type { Metadata } from 'next';
import ErrorBoundary from '@/components/ErrorBoundary';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stock Screener',
  description: 'Automated stock screening for high-potential recovery plays',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-900 text-slate-100">
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}

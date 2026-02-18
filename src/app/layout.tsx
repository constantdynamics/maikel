import type { Metadata } from 'next';
import ErrorBoundary from '@/components/ErrorBoundary';
import ClientLayout from '@/components/ClientLayout';
import './globals.css';

export const metadata: Metadata = {
  title: 'Professor Zonnebloem',
  description: 'Automated detection of high-potential recovery opportunities',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

const themeInitScript = `
  (function() {
    try {
      var theme = localStorage.getItem('theme') || 'sunflower';
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#1a1a1a" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen">
        <ErrorBoundary>
          <ClientLayout>{children}</ClientLayout>
        </ErrorBoundary>
      </body>
    </html>
  );
}

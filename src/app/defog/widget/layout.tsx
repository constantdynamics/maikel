import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Zonnebloem Widget',
  description: 'Stock screener widget',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1a1a1a',
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

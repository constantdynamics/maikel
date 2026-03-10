import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recycle Bin',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

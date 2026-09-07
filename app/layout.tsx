import type { Metadata, Viewport } from 'next';
import './globals.css';
import './friendly.css';
export const metadata: Metadata = { title: 'V Connect · Your WhatsApp workspace', description: 'Manage your team and WhatsApp numbers in one secure workspace.', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#599ad7' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Fastrack Lab', description: 'Evidence-based Bluetooth companion and diagnostics for Fastrack watches' };
export default function RootLayout({children}: Readonly<{children:React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }

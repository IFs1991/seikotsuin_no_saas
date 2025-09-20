import React from 'react';
import './globals.css';
import { ClientLayout } from './client-layout';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '整骨院経営管理システム',
  description: '46店舗展開の整骨院グループ向けリアルタイム経営分析システム',
  icons: {
    icon: '/favicon.ico',
  },
};

interface LayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: LayoutProps) {
  return (
    <html lang='ja'>
      <body className='min-h-screen'>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}

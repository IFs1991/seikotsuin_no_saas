import React from 'react';
import './globals.css';
import type { Metadata } from 'next';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: '整骨院経営管理システム',
  description: '46店舗展開の整骨院グループ向けリアルタイム経営分析システム',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
};

interface LayoutProps {
  children: React.ReactNode;
}

export default async function RootLayout({ children }: LayoutProps) {
  // リクエストごとのnonceをSSRへ付けるため、静的HTMLを再利用しない。
  await connection();
  return (
    <html lang='ja'>
      <body className='min-h-screen' suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

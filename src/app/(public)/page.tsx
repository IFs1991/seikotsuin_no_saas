import React from 'react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center p-4'>
      <div className='w-full max-w-lg text-center space-y-8'>
        {/* Logo */}
        <div className='w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto'>
          <span className='text-white font-bold text-3xl'>骨</span>
        </div>

        {/* Service name */}
        <div className='space-y-3'>
          <h1 className='text-3xl font-bold text-gray-900'>
            整骨院・治療院向け業務管理SaaS
          </h1>
          <p className='text-lg text-gray-600'>
            予約・患者・運営管理を一元化し、現場と管理をつなぐ
          </p>
        </div>

        {/* CTA buttons */}
        <div className='flex flex-col sm:flex-row gap-4 justify-center'>
          <Link
            href='/login'
            className='inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors'
          >
            スタッフログイン
          </Link>
          <Link
            href='/admin/login'
            className='inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors'
          >
            管理者ログイン
          </Link>
        </div>

        {/* Footer links */}
        <div className='flex items-center justify-center gap-4 text-sm text-gray-500'>
          <Link href='/terms' className='hover:text-gray-700 underline'>
            利用規約
          </Link>
          <span>|</span>
          <Link href='/privacy' className='hover:text-gray-700 underline'>
            プライバシーポリシー
          </Link>
        </div>
      </div>
    </div>
  );
}

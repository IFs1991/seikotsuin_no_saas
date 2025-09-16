"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onToggleSidebar: () => void;
  onToggleDarkMode: () => void;
  isDarkMode: boolean;
}

export function Header({ onToggleSidebar, onToggleDarkMode, isDarkMode }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState('本店');
  const router = useRouter();

  const clinics = [
    '本店',
    '新宿店',
    '渋谷店',
    '池袋店',
    '横浜店'
  ];

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const handleSettingsClick = () => {
    router.push('/admin/login');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 w-full px-4 py-2 bg-[#1e3a8a] text-white flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" onClick={onToggleSidebar} className="text-white hover:bg-blue-700">
          ☰
        </Button>
        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
          <span className="text-blue-600 font-bold text-sm">骨</span>
        </div>
        <h1 className="text-xl font-bold">整骨院グループ管理システム</h1>
      </div>

      <div className="hidden md:flex items-center space-x-6">
        <select 
          value={selectedClinic}
          onChange={(e) => setSelectedClinic(e.target.value)}
          className="bg-[#2563eb] text-white px-3 py-1 rounded"
        >
          {clinics.map(clinic => (
            <option key={clinic} value={clinic}>{clinic}</option>
          ))}
        </select>

        <div className="relative">
          <Button variant="ghost" className="relative">
            <span className="absolute -top-1 -right-1 h-4 w-4 bg-[#ef4444] rounded-full text-xs flex items-center justify-center">3</span>
            通知
          </Button>
        </div>

        <Button variant="ghost" onClick={handleSettingsClick}>設定</Button>

        <Button 
          variant="ghost"
          onClick={onToggleDarkMode}
          className="text-white hover:bg-blue-700"
        >
          {isDarkMode ? '🌙' : '☀️'}
        </Button>

        <Button variant="ghost" className="text-white hover:bg-blue-700">ログアウト</Button>
      </div>

      <Button 
        variant="ghost" 
        className="md:hidden"
        onClick={toggleMenu}
      >
        メニュー
      </Button>

      {isMenuOpen && (
        <div className="absolute top-16 right-4 bg-[#1e3a8a] p-4 rounded shadow-lg md:hidden">
          <div className="flex flex-col space-y-4">
            <select 
              value={selectedClinic}
              onChange={(e) => setSelectedClinic(e.target.value)}
              className="bg-[#2563eb] text-white px-3 py-1 rounded"
            >
              {clinics.map(clinic => (
                <option key={clinic} value={clinic}>{clinic}</option>
              ))}
            </select>
            <Button variant="ghost">通知</Button>
            <Button variant="ghost" onClick={handleSettingsClick}>設定</Button>
            <Button variant="ghost" onClick={onToggleDarkMode}>
              {isDarkMode ? '🌙' : '☀️'}
            </Button>
            <Button variant="ghost">ログアウト</Button>
          </div>
        </div>
      )}
    </div>
  );
}
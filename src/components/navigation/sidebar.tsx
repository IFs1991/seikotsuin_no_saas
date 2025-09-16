"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [openSubMenus, setOpenSubMenus] = useState<string[]>([]);

  const menuItems = [
    {
      id: 'dashboard',
      label: 'ダッシュボード',
      icon: 'ChartBar',
      href: '/dashboard'
    },
    {
      id: 'daily-reports',
      label: '日報管理',
      icon: 'FileText',
      href: '/daily-reports',
      subItems: [
        { id: 'input', label: '日報入力', href: '/daily-reports' },
        { id: 'list', label: '日報一覧', href: '/daily-reports' }
      ]
    },
    {
      id: 'patients',
      label: '患者分析',
      icon: 'Users',
      href: '/patients'
    },
    {
      id: 'revenue',
      label: '収益分析',
      icon: 'DollarSign',
      href: '/revenue'
    },
    {
      id: 'staff',
      label: 'スタッフ管理',
      icon: 'UserGroup',
      href: '/staff'
    },
    {
      id: 'ai-insights',
      label: 'AI分析',
      icon: 'Sparkles',
      href: '/ai-insights'
    }
  ];

  const quickAccess = [
    { id: 'daily-input', label: '日報入力', href: '/daily-reports/input' },
    { id: 'patient-search', label: '患者検索', href: '/patients' },
    { id: 'revenue-report', label: '収益レポート', href: '/revenue' }
  ];

  const recentlyUsed = [
    { id: 'staff-performance', label: 'スタッフ実績', href: '/staff' },
    { id: 'patient-flow', label: '患者フロー', href: '/patients' }
  ];

  const toggleSubMenu = (menuId: string) => {
    setOpenSubMenus(prev => 
      prev.includes(menuId) 
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  };

  return (
    <div className={`fixed left-0 top-16 h-screen bg-[#1e3a8a] text-white transition-all duration-300 z-40 ${
      isOpen ? 'translate-x-0' : '-translate-x-full'
    } lg:translate-x-0 ${isExpanded ? 'w-64' : 'w-20'}`}>
      <div className="p-4 flex justify-between items-center border-b border-[#2d4ba0]">
        <h1 className={`font-bold ${isExpanded ? 'block' : 'hidden'}`}>整骨院管理</h1>
        <Button 
          onClick={() => setIsExpanded(!isExpanded)}
          variant="ghost"
          className="text-white hover:bg-[#2d4ba0]"
        >
          {isExpanded ? '←' : '→'}
        </Button>
      </div>

      <div className="p-4">
        {menuItems.map(item => (
          <div key={item.id}>
            <Link href={item.href} className="w-full">
              <Button
                variant="ghost"
                className={`w-full mb-2 justify-start ${
                  activeMenu === item.id ? 'bg-[#2d4ba0]' : 'hover:bg-[#2d4ba0]'
                }`}
                onClick={(e) => {
                  setActiveMenu(item.id);
                  if (item.subItems) {
                    e.preventDefault();
                    toggleSubMenu(item.id);
                  }
                }}
              >
                <span className={`mr-2 ${!isExpanded && 'mr-0'}`}>{item.icon}</span>
                {isExpanded && item.label}
              </Button>
            </Link>
            
            {item.subItems && isExpanded && openSubMenus.includes(item.id) && (
              <div className="ml-4">
                {item.subItems.map(subItem => (
                  <Link key={subItem.id} href={subItem.href} className="w-full">
                    <Button
                      variant="ghost"
                      className="w-full mb-1 justify-start text-sm"
                    >
                      {subItem.label}
                    </Button>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {isExpanded && (
          <>
            <Separator className="my-4 bg-[#2d4ba0]" />
            
            <div className="mb-4">
              <h2 className="text-sm font-bold mb-2">クイックアクセス</h2>
              {quickAccess.map(item => (
                <Link key={item.id} href={item.href} className="w-full">
                  <Button
                    variant="ghost"
                    className="w-full mb-1 justify-start text-sm"
                  >
                    {item.label}
                  </Button>
                </Link>
              ))}
            </div>

            <div>
              <h2 className="text-sm font-bold mb-2">最近使用</h2>
              {recentlyUsed.map(item => (
                <Link key={item.id} href={item.href} className="w-full">
                  <Button
                    variant="ghost"
                    className="w-full mb-1 justify-start text-sm"
                  >
                    {item.label}
                  </Button>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
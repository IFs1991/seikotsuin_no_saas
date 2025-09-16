"use client";

import React, { useRef, useCallback } from 'react';

interface SwipeHandlerProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number; // スワイプとして認識する最小距離（px）
  className?: string;
}

export const SwipeHandler: React.FC<SwipeHandlerProps> = ({
  children,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  className,
}) => {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchEndRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current || !touchEndRef.current) return;

    const deltaX = touchEndRef.current.x - touchStartRef.current.x;
    const deltaY = touchEndRef.current.y - touchStartRef.current.y;
    
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // 水平方向のスワイプの方が大きい場合
    if (absDeltaX > absDeltaY && absDeltaX > threshold) {
      if (deltaX > 0) {
        onSwipeRight?.();
      } else {
        onSwipeLeft?.();
      }
    }
    // 垂直方向のスワイプの方が大きい場合
    else if (absDeltaY > absDeltaX && absDeltaY > threshold) {
      if (deltaY > 0) {
        onSwipeDown?.();
      } else {
        onSwipeUp?.();
      }
    }

    // リセット
    touchStartRef.current = null;
    touchEndRef.current = null;
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold]);

  return (
    <div
      className={className}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-y' }} // 垂直スクロールは維持
    >
      {children}
    </div>
  );
};

// タブ切り替え用のスワイプコンポーネント
interface SwipeTabsProps {
  children: React.ReactNode[];
  activeTab: number;
  onTabChange: (index: number) => void;
  className?: string;
}

export const SwipeTabs: React.FC<SwipeTabsProps> = ({
  children,
  activeTab,
  onTabChange,
  className,
}) => {
  const handleSwipeLeft = useCallback(() => {
    if (activeTab < children.length - 1) {
      onTabChange(activeTab + 1);
    }
  }, [activeTab, children.length, onTabChange]);

  const handleSwipeRight = useCallback(() => {
    if (activeTab > 0) {
      onTabChange(activeTab - 1);
    }
  }, [activeTab, onTabChange]);

  return (
    <SwipeHandler
      onSwipeLeft={handleSwipeLeft}
      onSwipeRight={handleSwipeRight}
      className={className}
    >
      <div className="relative overflow-hidden">
        <div 
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${activeTab * 100}%)` }}
        >
          {children.map((child, index) => (
            <div key={index} className="w-full flex-shrink-0">
              {child}
            </div>
          ))}
        </div>
      </div>
    </SwipeHandler>
  );
};

// プルトゥリフレッシュ用コンポーネント
interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number;
  className?: string;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  children,
  onRefresh,
  threshold = 80,
  className,
}) => {
  const [isPulling, setIsPulling] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [pullDistance, setPullDistance] = React.useState(0);
  const touchStartY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touchY = e.touches[0].clientY;
    const distance = touchY - touchStartY.current;
    
    if (distance > 0 && window.scrollY === 0) {
      setIsPulling(true);
      setPullDistance(Math.min(distance, threshold * 1.5));
      e.preventDefault();
    }
  }, [threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance > threshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    setIsPulling(false);
    setPullDistance(0);
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  return (
    <div
      className={className}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="transition-transform duration-200"
        style={{
          transform: isPulling ? `translateY(${pullDistance * 0.5}px)` : 'none',
        }}
      >
        {/* プルインジケーター */}
        {(isPulling || isRefreshing) && (
          <div className="flex justify-center items-center py-4 text-primary-600">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
            <span className="ml-2 text-sm">
              {isRefreshing ? '更新中...' : '離してリフレッシュ'}
            </span>
          </div>
        )}
        
        {children}
      </div>
    </div>
  );
};
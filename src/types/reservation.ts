/**
 * 予約管理システムの型定義
 */

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  lineUserId?: string;
  customAttributes?: Record<string, any>;
  consentMarketing: boolean;
  consentReminder: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Menu {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  description: string;
  isActive: boolean;
}

export interface Resource {
  id: string;
  name: string;
  type: 'staff' | 'room' | 'bed' | 'device';
  workingHours: {
    monday?: { start: string; end: string } | null;
    tuesday?: { start: string; end: string } | null;
    wednesday?: { start: string; end: string } | null;
    thursday?: { start: string; end: string } | null;
    friday?: { start: string; end: string } | null;
    saturday?: { start: string; end: string } | null;
    sunday?: { start: string; end: string } | null;
  };
  maxConcurrent: number;
  supportedMenus: string[];
  isActive: boolean;
}

export interface Reservation {
  id: string;
  customerId: string;
  menuId: string;
  staffId: string;
  startTime: Date;
  endTime: Date;
  status: 'tentative' | 'confirmed' | 'arrived' | 'completed' | 'cancelled' | 'no_show' | 'unconfirmed' | 'trial';
  channel: 'line' | 'web' | 'phone' | 'walk_in';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  conflictReason?: string;
}

export interface CreateReservationData {
  customerId: string;
  menuId: string;
  staffId: string;
  startTime: Date;
  endTime: Date;
  channel: 'line' | 'web' | 'phone' | 'walk_in';
  notes?: string;
  createdBy: string;
}

export interface CreateMultipleReservationData {
  customerId: string;
  menuId: string;
  staffId: string;
  baseStartTime: Date;
  duration: number;
  dates: Date[];
  channel: 'line' | 'web' | 'phone' | 'walk_in';
  notes?: string;
  createdBy: string;
}

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

export interface ReservationStats {
  totalReservations: number;
  confirmedReservations: number;
  cancelledReservations: number;
  noShowCount: number;
  averageUtilization: number;
}

export interface StaffUtilization {
  staffId: string;
  staffName: string;
  utilizationRate: number;
}

export interface NoShowAnalysis {
  totalNoShows: number;
  noShowRate: number;
  topReasons: { reason: string; count: number }[];
  channelBreakdown: {
    line: number;
    phone: number;
    web: number;
    walk_in?: number;
  };
}

// F008: 販売停止設定
export interface Block {
  id: string;
  resourceId: string;
  startTime: Date;
  endTime: Date;
  recurrenceRule?: string; // RFC 5545 RRULE形式
  reason?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBlockData {
  resourceId: string;
  startTime: Date;
  endTime: Date;
  recurrenceRule?: string;
  reason?: string;
  createdBy: string;
}
import type { ReservationOptionSelection } from '@/types/reservation';

export interface SchedulerResource {
  id: string;
  name: string;
  capacity?: number;
  subLabel?: string;
  type: 'staff' | 'facility';
}

export interface MenuOptionItem {
  id: string;
  name: string;
  priceDelta: number;
  durationDeltaMinutes: number;
  isActive?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  options?: MenuOptionItem[];
}

export interface Appointment {
  id: string;
  resourceId: string;
  date: string; // YYYY-MM-DD
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  title: string;
  lastName?: string;
  firstName?: string;
  menuId?: string;
  optionId?: string;
  subTitle?: string;
  type: 'normal' | 'holiday' | 'blocked';
  color: 'red' | 'pink' | 'blue' | 'orange' | 'purple' | 'grey';
  icon?: boolean;
  memo?: string;
  status?:
    | 'tentative'
    | 'confirmed'
    | 'arrived'
    | 'completed'
    | 'cancelled'
    | 'no_show'
    | 'unconfirmed'
    | 'trial';
  customerId?: string;
  staffId?: string;
  menuName?: string;
  staffName?: string;
  selectedOptions?: ReservationOptionSelection[];
}

export interface Notification {
  id: string;
  date: string;
  title: string;
  content: string;
  type: 'system' | 'news' | 'alert';
  isRead: boolean;
}

export interface TimeSlot {
  hour: number;
  label: string;
}

export type ViewMode = 'timeline' | 'list' | 'register';
export type AppointmentUpdateResult = { ok: boolean; error?: string };

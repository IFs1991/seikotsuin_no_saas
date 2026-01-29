export interface Resource {
  id: string;
  name: string;
  capacity?: number; // e.g., (2), (1)
  subLabel?: string; // e.g., "Acceptable: 1"
  type: 'staff' | 'facility';
}

export interface Menu {
  id: string;
  name: string;
  duration: number; // minutes
  price: number;
}

export interface OptionItem {
  id: string;
  name: string;
  duration: number; // minutes
  price: number;
}

export interface Appointment {
  id: string;
  resourceId: string;
  date: string; // YYYY-MM-DD
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  title: string; // Display title (usually Name)
  lastName?: string;
  firstName?: string;
  menuId?: string;
  optionId?: string;
  subTitle?: string; // e.g. "Seat A"
  type: 'normal' | 'holiday' | 'blocked';
  color: 'red' | 'pink' | 'blue' | 'orange' | 'purple' | 'grey';
  icon?: boolean;
  memo?: string;
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

import {
  Resource,
  Appointment,
  TimeSlot,
  Menu,
  OptionItem,
  Notification,
} from './types';

// Layout Constants
export const PIXELS_PER_HOUR = 140;
export const SIDEBAR_WIDTH = 180;
export const GRID_START_HOUR = 9;
export const SNAP_MINUTES = 5; // Drag & Drop snap interval
export const CLICK_SNAP_MINUTES = 5; // Click snap interval

export const TIME_SLOTS: TimeSlot[] = [
  { hour: 9, label: '09:00' },
  { hour: 10, label: '10:00' },
  { hour: 11, label: '11:00' },
  { hour: 12, label: '12:00' },
  { hour: 13, label: '13:00' },
  { hour: 14, label: '14:00' },
  { hour: 15, label: '15:00' },
  { hour: 16, label: '16:00' },
  { hour: 17, label: '17:00' },
];

export const RESOURCES: Resource[] = [
  { id: 'r1', name: '鈴木', capacity: 2, type: 'staff' },
  { id: 'r2', name: '山田', capacity: 1, type: 'staff' },
  { id: 'r3', name: '伊藤', capacity: 1, type: 'staff' },
  { id: 'r4', name: '指名なし', type: 'staff' },
];

export const MENUS: Menu[] = [
  { id: 'm1', name: 'カット', duration: 60, price: 5500 },
  { id: 'm2', name: 'カット + カラー', duration: 120, price: 12000 },
  { id: 'm3', name: 'カット + パーマ', duration: 120, price: 13000 },
  { id: 'm4', name: 'トリートメント', duration: 30, price: 4000 },
  { id: 'm5', name: 'ヘッドスパ', duration: 45, price: 6000 },
];

export const OPTIONS: OptionItem[] = [
  { id: 'o1', name: 'なし', duration: 0, price: 0 },
  { id: 'o2', name: '指名料', duration: 0, price: 550 },
  { id: 'o3', name: '炭酸シャンプー変更', duration: 0, price: 1100 },
  { id: 'o4', name: '眉カット', duration: 10, price: 1100 },
];

// Helper to get date string for "today" relative to the mock fixed date
const BASE_DATE = '2020-04-20';

export const APPOINTMENTS: Appointment[] = [
  // Suzuki - Staff Holiday
  {
    id: 'a1',
    resourceId: 'r1',
    date: BASE_DATE,
    startHour: 9,
    startMinute: 0,
    endHour: 23,
    endMinute: 0,
    title: 'スタッフ休',
    type: 'holiday',
    color: 'grey',
  },

  // Yamada
  {
    id: 'a2',
    resourceId: 'r2',
    date: BASE_DATE,
    startHour: 9,
    startMinute: 0,
    endHour: 10,
    endMinute: 0,
    title: 'リビッテ 太郎',
    lastName: 'リビッテ',
    firstName: '太郎',
    menuId: 'm1',
    optionId: 'o1',
    type: 'normal',
    color: 'red',
    icon: true,
    memo: '初回クーポン利用。肩こりがひどいとのこと。',
  },
  {
    id: 'a3',
    resourceId: 'r2',
    date: BASE_DATE,
    startHour: 11,
    startMinute: 0,
    endHour: 12,
    endMinute: 30,
    title: 'リビッテ 四郎',
    lastName: 'リビッテ',
    firstName: '四郎',
    menuId: 'm3',
    optionId: 'o1',
    type: 'normal',
    color: 'pink',
  },
  {
    id: 'a4',
    resourceId: 'r2',
    date: BASE_DATE,
    startHour: 12,
    startMinute: 30,
    endHour: 14,
    endMinute: 0,
    title: 'リビッテ 五郎',
    lastName: 'リビッテ',
    firstName: '五郎',
    menuId: 'm2',
    optionId: 'o2',
    type: 'normal',
    color: 'purple',
  },
  {
    id: 'a5',
    resourceId: 'r2',
    date: BASE_DATE,
    startHour: 16,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
    title: 'リビッテ 二郎',
    lastName: 'リビッテ',
    firstName: '二郎',
    menuId: 'm2',
    optionId: 'o1',
    type: 'normal',
    color: 'purple',
  },

  // Ito
  {
    id: 'a6',
    resourceId: 'r3',
    date: BASE_DATE,
    startHour: 11,
    startMinute: 0,
    endHour: 14,
    endMinute: 0,
    title: '販売停止',
    type: 'blocked',
    color: 'grey',
  },
  {
    id: 'a7',
    resourceId: 'r3',
    date: BASE_DATE,
    startHour: 14,
    startMinute: 0,
    endHour: 15,
    endMinute: 30,
    title: 'リビッテ 花子',
    lastName: 'リビッテ',
    firstName: '花子',
    menuId: 'm1',
    optionId: 'o4',
    type: 'normal',
    color: 'pink',
    memo: '前回遅刻あり。要注意。',
  },
  {
    id: 'a8',
    resourceId: 'r3',
    date: BASE_DATE,
    startHour: 15,
    startMinute: 30,
    endHour: 17,
    endMinute: 5,
    title: 'リビッテ 三郎',
    lastName: 'リビッテ',
    firstName: '三郎',
    menuId: 'm3',
    optionId: 'o1',
    type: 'normal',
    color: 'blue',
  },

  // No Nomination
  {
    id: 'a9',
    resourceId: 'r4',
    date: BASE_DATE,
    startHour: 10,
    startMinute: 0,
    endHour: 11,
    endMinute: 0,
    title: 'リビッテ 七郎',
    lastName: 'リビッテ',
    firstName: '七郎',
    menuId: 'm1',
    optionId: 'o1',
    type: 'normal',
    color: 'orange',
  },
];

export const COLORS = {
  red: 'bg-rose-400 border-rose-500 text-white',
  pink: 'bg-pink-300 border-pink-400 text-white',
  blue: 'bg-sky-400 border-sky-500 text-white',
  orange: 'bg-orange-400 border-orange-500 text-white',
  purple: 'bg-indigo-600 border-indigo-700 text-white',
  grey: 'bg-gray-300 border-gray-400 text-gray-700', // For blocked/holiday
};

// Mock data for unconfirmed (Web) reservations
export const PENDING_APPOINTMENTS: Appointment[] = [
  {
    id: 'p1',
    resourceId: 'r2',
    date: BASE_DATE,
    startHour: 18,
    startMinute: 0,
    endHour: 19,
    endMinute: 0,
    title: 'WEB予約: 田中',
    lastName: '田中',
    firstName: '美咲',
    menuId: 'm1',
    optionId: 'o1',
    type: 'normal',
    color: 'orange',
    memo: 'WEBからの予約です。',
  },
  {
    id: 'p2',
    resourceId: 'r4',
    date: BASE_DATE,
    startHour: 13,
    startMinute: 0,
    endHour: 15,
    endMinute: 0,
    title: 'WEB予約: 佐藤',
    lastName: '佐藤',
    firstName: '健',
    menuId: 'm2',
    optionId: 'o1',
    type: 'normal',
    color: 'blue',
    memo: '初めてです。',
  },
];

// Mock data for notifications
export const NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    date: '2020-04-20',
    title: 'ゴールデンウィークの営業について',
    content: '5月3日から5月5日まで休業とさせていただきます。',
    type: 'news',
    isRead: false,
  },
  {
    id: 'n2',
    date: '2020-04-19',
    title: 'システムメンテナンスのお知らせ',
    content: '4月22日 2:00〜4:00の間、サーバーメンテナンスを実施します。',
    type: 'system',
    isRead: false,
  },
  {
    id: 'n3',
    date: '2020-04-15',
    title: '【重要】感染症対策の徹底について',
    content: 'マスク着用と消毒の徹底をお願いいたします。',
    type: 'alert',
    isRead: true,
  },
];

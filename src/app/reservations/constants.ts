export const PIXELS_PER_HOUR = 140;
export const SIDEBAR_WIDTH = 180;
export const GRID_START_HOUR = 9;
export const GRID_END_HOUR = 21;
export const SNAP_MINUTES = 5;
export const CLICK_SNAP_MINUTES = 5;

export const buildTimeSlots = (
  startHour: number = GRID_START_HOUR,
  endHour: number = GRID_END_HOUR
) => {
  const slots: { hour: number; label: string }[] = [];
  for (let hour = startHour; hour < endHour; hour += 1) {
    slots.push({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
    });
  }
  return slots;
};

export const COLORS = {
  red: 'bg-rose-400 border-rose-500 text-white',
  pink: 'bg-pink-300 border-pink-400 text-white',
  blue: 'bg-sky-400 border-sky-500 text-white',
  orange: 'bg-orange-400 border-orange-500 text-white',
  purple: 'bg-indigo-600 border-indigo-700 text-white',
  grey: 'bg-gray-300 border-gray-400 text-gray-700',
};

export const COLORS_LEFT_BORDER: Record<string, string> = {
  red: 'border-l-4 border-rose-500',
  pink: 'border-l-4 border-pink-400',
  blue: 'border-l-4 border-sky-500',
  orange: 'border-l-4 border-orange-500',
  purple: 'border-l-4 border-indigo-700',
  grey: 'border-l-4 border-gray-400',
};

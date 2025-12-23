import { PIXELS_PER_HOUR, GRID_START_HOUR } from '../constants';

/**
 * Calculates hour and minute from an X-coordinate relative to the timeline grid.
 */
export const calculateTimeFromX = (x: number, snapToMinutes: number = 5) => {
  const totalMinutes = (x / PIXELS_PER_HOUR) * 60;
  let hour = GRID_START_HOUR + Math.floor(totalMinutes / 60);
  const rawMinute = totalMinutes % 60;
  
  // Snap logic
  let minute = Math.round(rawMinute / snapToMinutes) * snapToMinutes;
  
  if (minute === 60) {
      minute = 0;
      hour += 1;
  }
  
  return { hour, minute };
};

/**
 * Calculates the end time given a start time and duration in minutes.
 */
export const calculateEndTime = (startHour: number, startMinute: number, durationMinutes: number) => {
  const totalStartMinutes = startHour * 60 + startMinute;
  const totalEndMinutes = totalStartMinutes + durationMinutes;

  const endHour = Math.floor(totalEndMinutes / 60);
  const endMinute = totalEndMinutes % 60;

  return { endHour, endMinute };
};

/**
 * Calculates the duration between two times in minutes.
 */
export const calculateDuration = (startHour: number, startMinute: number, endHour: number, endMinute: number) => {
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return Math.max(0, end - start);
};

/**
 * Converts HH:MM to total minutes from midnight.
 */
export const timeToMinutes = (hour: number, minute: number) => {
  return hour * 60 + minute;
};

/**
 * Checks if two time ranges overlap.
 * Range is start (inclusive) to end (exclusive).
 */
export const hasTimeConflict = (
  start1: number, end1: number, 
  start2: number, end2: number
) => {
  return start1 < end2 && end1 > start2;
};
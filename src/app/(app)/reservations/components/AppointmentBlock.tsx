import React from 'react';
import { Appointment, AppointmentDensity } from '../types';
import { COLORS } from '../constants';
import { MessageCircle } from 'lucide-react';
import {
  formatAppointmentTime,
  getAppointmentStatusLabel,
} from '../utils/view';

interface Props {
  appointment: Appointment;
  pixelsPerHour: number;
  startHourOfGrid: number;
  onClick: (appointment: Appointment) => void;
  density: AppointmentDensity;
  draggable?: boolean;
  laneIndex?: 0 | 1;
  laneCount?: 1 | 2;
}

const AppointmentBlockComponent: React.FC<Props> = ({
  appointment,
  pixelsPerHour,
  startHourOfGrid,
  onClick,
  density,
  draggable = true,
  laneIndex = 0,
  laneCount = 1,
}) => {
  const startOffsetMinutes =
    (appointment.startHour - startHourOfGrid) * 60 + appointment.startMinute;
  const durationMinutes =
    appointment.endHour * 60 +
    appointment.endMinute -
    (appointment.startHour * 60 + appointment.startMinute);

  // Calculate position and width
  const leftPos = (startOffsetMinutes / 60) * pixelsPerHour;
  const width = (durationMinutes / 60) * pixelsPerHour;

  const colorClass = COLORS[appointment.color];

  // Specific styling for full-row events like "Staff Holiday"
  const isFullRow = appointment.type === 'holiday';

  const timeString = formatAppointmentTime(appointment);
  const statusLabel = getAppointmentStatusLabel(appointment);
  const nominationLabel = appointment.isStaffRequested ? ' 指名' : '';
  const showSecondaryLine = density === 'comfortable' && width >= 88;
  const showStatus = width >= 112;
  const verticalStyle =
    laneCount === 2
      ? {
          top: laneIndex === 0 ? '2px' : 'calc(50% + 1px)',
          height: 'calc(50% - 3px)',
        }
      : {
          top: '4px',
          height: 'calc(100% - 8px)',
        };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggable) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        id: appointment.id,
        originalResource: appointment.resourceId,
      })
    );
    e.dataTransfer.effectAllowed = 'move';
    // Optional: Set a custom drag image or style here
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }

    e.preventDefault();
    onClick(appointment);
  };

  return (
    <div
      role='button'
      tabIndex={0}
      draggable={draggable}
      onDragStart={handleDragStart}
      onClick={e => {
        e.stopPropagation();
        onClick(appointment);
      }}
      onKeyDown={handleKeyDown}
      title={`${timeString} ${appointment.title} ${statusLabel}${nominationLabel}`}
      aria-label={`${timeString} ${appointment.title} ${statusLabel}${nominationLabel}`}
      className={`absolute rounded shadow-sm text-xs overflow-hidden leading-tight flex flex-col justify-center px-2 transition-all hover:brightness-95 hover:shadow-md cursor-pointer z-10 ${colorClass} ${isFullRow ? 'opacity-90' : ''}`}
      style={{
        left: `${leftPos}px`,
        width: `${width}px`,
        ...verticalStyle,
      }}
    >
      <div className='flex items-center gap-1 font-mono opacity-90 text-[10px] whitespace-nowrap pointer-events-none'>
        {appointment.icon && (
          <div className='bg-white/30 p-0.5 rounded-sm'>
            <MessageCircle size={8} />
          </div>
        )}
        {timeString}
        {showStatus && (
          <span className='ml-auto rounded bg-white/30 px-1 py-0.5 font-sans text-[9px] font-bold'>
            {statusLabel}
          </span>
        )}
      </div>
      <div className='font-bold truncate text-[11px] mt-0.5 pointer-events-none'>
        {appointment.title}
      </div>
      {showSecondaryLine && (appointment.subTitle || appointment.menuName) && (
        <div className='mt-1 inline-flex min-w-0 pointer-events-none'>
          <span className='bg-rose-600/80 text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold truncate'>
            {appointment.subTitle || appointment.menuName}
          </span>
        </div>
      )}
      {appointment.isStaffRequested && width >= 72 && (
        <div className='mt-1 pointer-events-none'>
          <span className='rounded bg-sky-700/80 px-1.5 py-0.5 text-[9px] font-bold text-white'>
            指名
          </span>
        </div>
      )}
    </div>
  );
};

export const AppointmentBlock = React.memo(AppointmentBlockComponent);

import React, { useState, useEffect } from 'react';
import {
  PIXELS_PER_HOUR,
  SIDEBAR_WIDTH,
  GRID_START_HOUR,
  GRID_END_HOUR,
  SNAP_MINUTES,
  CLICK_SNAP_MINUTES,
} from '../constants';
import { AppointmentBlock } from './AppointmentBlock';
import {
  Appointment,
  AppointmentUpdateResult,
  SchedulerResource,
  TimeSlot,
} from '../types';
import {
  calculateTimeFromX,
  calculateDuration,
  calculateEndTime,
  timeToMinutes,
  hasTimeConflict,
} from '../utils/time';

interface Props {
  appointments: Appointment[];
  resources: SchedulerResource[];
  timeSlots: TimeSlot[];
  onAppointmentClick: (appointment: Appointment) => void;
  onTimeSlotClick: (resourceId: string, hour: number, minute: number) => void;
  onAppointmentMove: (
    id: string,
    newResourceId: string,
    newStartHour: number,
    newStartMinute: number
  ) => Promise<AppointmentUpdateResult>;
  onMoveError?: (message: string) => void;
}

export const Scheduler: React.FC<Props> = ({
  appointments,
  resources,
  timeSlots,
  onAppointmentClick,
  onTimeSlotClick,
  onAppointmentMove,
  onMoveError,
}) => {
  const [now, setNow] = useState(new Date());

  // Update current time every minute to keep the red line accurate
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Calculate position of the current time line
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const endHour =
    timeSlots.length > 0
      ? timeSlots[timeSlots.length - 1].hour + 1
      : GRID_START_HOUR + 1;

  let currentTimePos = -1;
  // Note: In a real app, check if displayed date matches today.
  // Here we assume it's relevant if time is within grid range.
  if (currentHour >= GRID_START_HOUR && currentHour < endHour) {
    const hoursFromStart = currentHour - GRID_START_HOUR;
    currentTimePos =
      hoursFromStart * PIXELS_PER_HOUR + (currentMinute / 60) * PIXELS_PER_HOUR;
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (
    e: React.DragEvent<HTMLDivElement>,
    targetResourceId: string
  ) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');

    if (!data) return;

    try {
      const { id } = JSON.parse(data);

      // Find the appointment being moved
      const appointmentToMove = appointments.find(a => a.id === id);
      if (!appointmentToMove) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;

      // Use utility with SNAP_MINUTES (15 min for drag)
      const { hour: newStartHour, minute: newStartMinute } = calculateTimeFromX(
        x,
        SNAP_MINUTES
      );

      // Calculate new end time to check for conflicts
      const duration = calculateDuration(
        appointmentToMove.startHour,
        appointmentToMove.startMinute,
        appointmentToMove.endHour,
        appointmentToMove.endMinute
      );
      const { endHour, endMinute } = calculateEndTime(
        newStartHour,
        newStartMinute,
        duration
      );

      const newStartMins = timeToMinutes(newStartHour, newStartMinute);
      const newEndMins = timeToMinutes(endHour, endMinute);

      // Check for conflicts
      const hasConflict = appointments.some(a => {
        // Ignore the appointment itself
        if (a.id === id) return false;
        // Only check appointments on the target resource
        if (a.resourceId !== targetResourceId) return false;

        const aStartMins = timeToMinutes(a.startHour, a.startMinute);
        const aEndMins = timeToMinutes(a.endHour, a.endMinute);

        return hasTimeConflict(newStartMins, newEndMins, aStartMins, aEndMins);
      });

      if (hasConflict) {
        onMoveError?.('予約が重複しているため移動できません。');
        return;
      }

      await onAppointmentMove(
        id,
        targetResourceId,
        newStartHour,
        newStartMinute
      );
    } catch (err) {
      console.error('Failed to parse drag data', err);
    }
  };

  const handleSlotClick = (
    e: React.MouseEvent<HTMLDivElement>,
    resourceId: string
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Use utility with CLICK_SNAP_MINUTES (5 min for click)
    const { hour, minute } = calculateTimeFromX(x, CLICK_SNAP_MINUTES);

    onTimeSlotClick(resourceId, hour, minute);
  };

  return (
    <div className='bg-white m-4 shadow border border-gray-300 rounded overflow-hidden flex flex-col h-full'>
      {/* Header Row */}
      <div className='flex border-b border-gray-300 bg-slate-700 text-white z-20 sticky top-0'>
        <div
          className='flex-shrink-0 border-r border-slate-500 bg-slate-700'
          style={{ width: `${SIDEBAR_WIDTH}px` }}
        ></div>

        <div className='flex-grow overflow-hidden relative'>
          <div className='flex'>
            {timeSlots.map(slot => (
              <div
                key={slot.hour}
                className='flex-shrink-0 flex items-center justify-center border-r border-slate-600 text-sm font-bold'
                style={{ width: `${PIXELS_PER_HOUR}px`, height: '36px' }}
              >
                {slot.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid Body */}
      <div className='flex-grow overflow-y-auto overflow-x-auto timeline-scroll bg-gray-50 relative'>
        <div
          style={{
            width: `${SIDEBAR_WIDTH + timeSlots.length * PIXELS_PER_HOUR}px`,
          }}
        >
          {resources.map(resource => {
            if (resource.id === 'separator') {
              return (
                <div
                  key='sep'
                  className='h-1 bg-sky-200 border-y border-sky-300 w-full sticky left-0 z-30'
                  style={{
                    width: `${SIDEBAR_WIDTH + timeSlots.length * PIXELS_PER_HOUR}px`,
                  }}
                ></div>
              );
            }

            const resourceAppts = appointments.filter(
              a => a.resourceId === resource.id
            );
            const isFacility = resource.type === 'facility';

            return (
              <div
                key={resource.id}
                className='flex relative h-20 border-b border-gray-300 hover:bg-gray-50 transition-colors group'
              >
                {/* Resource Header */}
                <div
                  className='sticky left-0 flex-shrink-0 z-30 border-r border-gray-400 p-2 flex flex-col justify-center text-sm bg-slate-600 text-white shadow-[2px_0_5px_rgba(0,0,0,0.1)]'
                  style={{ width: `${SIDEBAR_WIDTH}px` }}
                >
                  <div className='font-bold flex items-center gap-1'>
                    {resource.name}
                    {resource.capacity && (
                      <span className='text-xs font-normal'>
                        ({resource.capacity})
                      </span>
                    )}
                  </div>
                  {resource.subLabel && (
                    <div className='text-[10px] text-gray-300 mt-1'>
                      {resource.subLabel}
                    </div>
                  )}
                  {!isFacility && resource.name !== '指名なし' && (
                    <div className='text-[9px] text-gray-400 mt-0.5'>
                      {String(GRID_START_HOUR).padStart(2, '0')}:00-{String(GRID_END_HOUR).padStart(2, '0')}:00
                    </div>
                  )}
                </div>

                {/* Timeline Area */}
                <div
                  className='relative flex bg-white cursor-pointer transition-colors'
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, resource.id)}
                  onClick={e => handleSlotClick(e, resource.id)}
                >
                  {/* Grid Lines */}
                  {timeSlots.map(slot => (
                    <div
                      key={slot.hour}
                      className='flex-shrink-0 border-r border-gray-200 h-full relative pointer-events-none'
                      style={{ width: `${PIXELS_PER_HOUR}px` }}
                    >
                      <div className='absolute left-1/2 top-0 bottom-0 border-r border-gray-100 w-0'></div>
                    </div>
                  ))}

                  {/* Appointments Layer */}
                  <div className='absolute top-0 bottom-0 left-0 right-0'>
                    {resourceAppts.map(appt => (
                      <AppointmentBlock
                        key={appt.id}
                        appointment={appt}
                        pixelsPerHour={PIXELS_PER_HOUR}
                        startHourOfGrid={GRID_START_HOUR}
                        onClick={onAppointmentClick}
                      />
                    ))}
                  </div>

                  {/* Current Time Line */}
                  {currentTimePos > 0 && (
                    <div
                      className='absolute top-0 bottom-0 z-20 pointer-events-none border-l-2 border-red-500 opacity-60'
                      style={{ left: `${currentTimePos}px` }}
                    >
                      <div className='absolute -top-1 -left-[5px] w-2 h-2 bg-red-500 rounded-full shadow-sm'></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

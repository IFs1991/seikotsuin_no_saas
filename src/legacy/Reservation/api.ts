import { APPOINTMENTS } from './constants';
import { Appointment } from './types';

// Simulated API Error
class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Simulates GET /api/reservations
 * Requirement: start_date and end_date are mandatory.
 */
export const fetchReservations = async (startDate: Date | null, endDate: Date | null): Promise<Appointment[]> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));

  if (!startDate || !endDate) {
    throw new ApiError('Start date and end date are required', 400);
  }

  // In a real app, we would filter by date here. 
  // Since our mock data is static, we just return the mock data.
  return [...APPOINTMENTS];
};

/**
 * Simulates POST /api/reservations
 */
export const createReservation = async (appointment: Omit<Appointment, 'id'>): Promise<Appointment> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const newAppointment: Appointment = {
    ...appointment,
    id: Math.random().toString(36).substr(2, 9),
  };
  
  return newAppointment;
};

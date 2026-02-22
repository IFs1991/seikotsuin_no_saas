import type { Appointment } from '../types';

export const statusToColor = (status?: Appointment['status']): Appointment['color'] => {
  switch (status) {
    case 'confirmed':
      return 'blue';
    case 'arrived':
      return 'purple';
    case 'completed':
      return 'purple';
    case 'unconfirmed':
      return 'orange';
    case 'tentative':
      return 'pink';
    case 'trial':
      return 'pink';
    case 'cancelled':
    case 'no_show':
      return 'grey';
    default:
      return 'red';
  }
};

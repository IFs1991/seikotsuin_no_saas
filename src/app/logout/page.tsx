import { clinicLogout } from '@/app/login/actions';

export default async function LogoutPage() {
  await clinicLogout();
  return null;
}

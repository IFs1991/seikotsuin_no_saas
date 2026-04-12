import { clinicLogout } from '@/app/(public)/login/actions';

export default async function LogoutPage() {
  await clinicLogout();
  return null;
}

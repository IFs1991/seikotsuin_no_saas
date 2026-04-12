import { logout } from '@/app/(public)/admin/actions';

export default async function AdminLogoutPage() {
  await logout();
  return null;
}

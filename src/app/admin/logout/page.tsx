import { logout } from '@/app/admin/actions';

export default async function AdminLogoutPage() {
  await logout();
  return null;
}

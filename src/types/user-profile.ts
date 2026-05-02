export interface UserProfile {
  id: string;
  email: string | null;
  role: string | null;
  clinicId: string | null;
  clinicName: string | null;
  isActive: boolean;
  isAdmin: boolean;
}

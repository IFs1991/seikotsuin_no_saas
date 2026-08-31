import type { UserProfile } from '@/types/user-profile';

export interface AppBootstrapClinic {
  id: string;
  name: string;
}

export interface AppBootstrapData {
  profile: UserProfile;
  clinics: AppBootstrapClinic[];
  currentClinicId: string | null;
  errors: {
    profile: string | null;
    clinics: string | null;
  };
  generatedAt: string;
}

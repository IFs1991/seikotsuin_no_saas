export type ManagerStaffListClinic = {
  id: string;
  name: string;
};

export type ManagerStaffListRow = {
  staffId: string;
  staffName: string;
  clinicId: string;
  clinicName: string;
  isActive: boolean;
  isBookable: boolean | null;
};

export type ManagerStaffListResponse = {
  generatedAt: string;
  clinics: ManagerStaffListClinic[];
  staff: ManagerStaffListRow[];
};

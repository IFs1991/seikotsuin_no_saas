export type ManagerAssignedClinic = {
  id: string;
  name: string;
};

export type ManagerAssignedClinicsResponse = {
  generatedAt: string;
  clinics: ManagerAssignedClinic[];
};

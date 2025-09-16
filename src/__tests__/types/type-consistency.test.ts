// =================================================================
// Type Consistency Tests - 型定義整合性のテスト
// =================================================================

import { 
  ApiResponse, 
  DashboardData, 
  PatientAnalysisData, 
  DailyReportForm,
  PatientForm,
  StaffForm,
  RevenueForm 
} from '../../types/api';

// 型チェック用の未使用型
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _RevenueAnalysisData = import('../../types/api').RevenueAnalysisData;
// eslint-disable-next-line @typescript-eslint/no-unused-vars  
type _StaffAnalysisData = import('../../types/api').StaffAnalysisData;

describe('Type Consistency', () => {
  describe('ApiResponse', () => {
    it('should have consistent success response structure', () => {
      const response: ApiResponse<string> = {
        success: true,
        data: 'test data'
      };

      expect(response.success).toBe(true);
      expect(response.data).toBe('test data');
      expect(response.error).toBeUndefined();
    });

    it('should have consistent error response structure', () => {
      const response: ApiResponse<string> = {
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test error message',
          timestamp: '2024-01-15T10:00:00Z'
        }
      };

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe('TEST_ERROR');
      expect(response.data).toBeUndefined();
    });
  });

  describe('DashboardData structure', () => {
    it('should have required properties with correct types', () => {
      const dashboardData: DashboardData = {
        dailyData: {
          revenue: 50000,
          patients: 25,
          insuranceRevenue: 30000,
          privateRevenue: 20000
        },
        aiComment: {
          id: 'comment-1',
          summary: 'Test summary',
          highlights: ['Good performance'],
          improvements: ['Needs improvement'],
          suggestions: ['Continue strategy'],
          created_at: '2024-01-15T10:00:00Z'
        },
        revenueChartData: [{
          name: '2024-01-15',
          '総売上': 50000,
          '保険診療': 30000,
          '自費診療': 20000
        }],
        heatmapData: [{
          hour_of_day: 9,
          day_of_week: 1,
          visit_count: 5,
          avg_revenue: 2000
        }],
        alerts: ['Test alert']
      };

      expect(typeof dashboardData.dailyData.revenue).toBe('number');
      expect(typeof dashboardData.dailyData.patients).toBe('number');
      expect(Array.isArray(dashboardData.revenueChartData)).toBe(true);
      expect(Array.isArray(dashboardData.heatmapData)).toBe(true);
      expect(Array.isArray(dashboardData.alerts)).toBe(true);
    });

    it('should allow null aiComment', () => {
      const dashboardData: DashboardData = {
        dailyData: {
          revenue: 0,
          patients: 0,
          insuranceRevenue: 0,
          privateRevenue: 0
        },
        aiComment: null,
        revenueChartData: [],
        heatmapData: [],
        alerts: []
      };

      expect(dashboardData.aiComment).toBeNull();
    });
  });

  describe('PatientAnalysisData structure', () => {
    it('should have required properties with correct types', () => {
      const patientData: PatientAnalysisData = {
        conversionData: {
          newPatients: 10,
          returnPatients: 8,
          conversionRate: 80,
          stages: [
            { name: 'Initial visit', value: 10 },
            { name: 'Return visit', value: 8 }
          ]
        },
        visitCounts: {
          average: 3.5,
          monthlyChange: 5.2
        },
        riskScores: [{
          patient_id: 'patient-1',
          name: 'Patient Name',
          riskScore: 25,
          lastVisit: '2024-01-10',
          category: 'low'
        }],
        ltvRanking: [{
          patient_id: 'patient-1',
          name: 'Patient Name',
          ltv: 150000,
          visit_count: 10,
          total_revenue: 100000
        }],
        segmentData: {
          age: [{ label: '30代', value: 35 }],
          visit: [{ label: '新患', value: 20 }]
        },
        followUpList: [{
          patient_id: 'patient-1',
          name: 'Patient Name',
          reason: 'High risk',
          lastVisit: '2024-01-10',
          action: 'Call patient'
        }],
        totalPatients: 100,
        activePatients: 85
      };

      expect(typeof patientData.totalPatients).toBe('number');
      expect(typeof patientData.activePatients).toBe('number');
      expect(Array.isArray(patientData.riskScores)).toBe(true);
      expect(Array.isArray(patientData.ltvRanking)).toBe(true);
      expect(Array.isArray(patientData.followUpList)).toBe(true);
    });
  });

  describe('Form types', () => {
    it('should validate DailyReportForm structure', () => {
      const form: DailyReportForm = {
        clinic_id: 'clinic-1',
        staff_id: 'staff-1',
        report_date: '2024-01-15',
        total_patients: 25,
        new_patients: 5,
        total_revenue: 50000,
        insurance_revenue: 30000,
        private_revenue: 20000,
        report_text: 'Daily report notes'
      };

      expect(typeof form.clinic_id).toBe('string');
      expect(typeof form.total_patients).toBe('number');
      expect(typeof form.report_date).toBe('string');
    });

    it('should validate PatientForm structure', () => {
      const form: PatientForm = {
        clinic_id: 'clinic-1',
        name: 'Patient Name',
        gender: 'male',
        date_of_birth: '1990-01-15',
        phone_number: '090-1234-5678',
        address: 'Tokyo, Japan'
      };

      expect(typeof form.clinic_id).toBe('string');
      expect(typeof form.name).toBe('string');
      expect(['male', 'female', 'other'].includes(form.gender!)).toBe(true);
    });

    it('should validate StaffForm structure', () => {
      const form: StaffForm = {
        clinic_id: 'clinic-1',
        name: 'Staff Name',
        role: 'practitioner',
        email: 'staff@example.com',
        hire_date: '2024-01-15',
        is_therapist: true
      };

      expect(typeof form.clinic_id).toBe('string');
      expect(typeof form.name).toBe('string');
      expect(['manager', 'practitioner', 'receptionist', 'admin'].includes(form.role)).toBe(true);
      expect(typeof form.is_therapist).toBe('boolean');
    });

    it('should validate RevenueForm structure', () => {
      const form: RevenueForm = {
        clinic_id: 'clinic-1',
        patient_id: 'patient-1',
        visit_id: 'visit-1',
        amount: 5000,
        insurance_revenue: 3000,
        private_revenue: 2000,
        treatment_menu_id: 'menu-1',
        payment_method_id: 'payment-1'
      };

      expect(typeof form.clinic_id).toBe('string');
      expect(typeof form.amount).toBe('number');
      expect(typeof form.insurance_revenue).toBe('number');
      expect(typeof form.private_revenue).toBe('number');
    });
  });

  describe('Optional fields', () => {
    it('should handle optional fields in forms', () => {
      const minimalPatientForm: PatientForm = {
        clinic_id: 'clinic-1',
        name: 'Patient Name'
      };

      expect(minimalPatientForm.gender).toBeUndefined();
      expect(minimalPatientForm.date_of_birth).toBeUndefined();
      expect(minimalPatientForm.phone_number).toBeUndefined();
      expect(minimalPatientForm.address).toBeUndefined();
    });

    it('should handle optional fields in revenue form', () => {
      const minimalRevenueForm: RevenueForm = {
        clinic_id: 'clinic-1',
        amount: 5000
      };

      expect(minimalRevenueForm.patient_id).toBeUndefined();
      expect(minimalRevenueForm.visit_id).toBeUndefined();
      expect(minimalRevenueForm.insurance_revenue).toBeUndefined();
      expect(minimalRevenueForm.private_revenue).toBeUndefined();
    });
  });

  describe('String literal types', () => {
    it('should enforce gender enum values', () => {
      const validGenders = ['male', 'female', 'other'] as const;
      
      validGenders.forEach(gender => {
        const form: PatientForm = {
          clinic_id: 'clinic-1',
          name: 'Test',
          gender
        };
        expect(form.gender).toBe(gender);
      });
    });

    it('should enforce staff role enum values', () => {
      const validRoles = ['manager', 'practitioner', 'receptionist', 'admin'] as const;
      
      validRoles.forEach(role => {
        const form: StaffForm = {
          clinic_id: 'clinic-1',
          name: 'Test',
          role,
          email: 'test@example.com',
          is_therapist: false
        };
        expect(form.role).toBe(role);
      });
    });

    it('should enforce risk category enum values', () => {
      const validCategories = ['high', 'medium', 'low'] as const;
      
      validCategories.forEach(category => {
        const riskScore: PatientAnalysisData['riskScores'][0] = {
          patient_id: 'patient-1',
          name: 'Test Patient',
          riskScore: 50,
          lastVisit: '2024-01-15',
          category
        };
        expect(riskScore.category).toBe(category);
      });
    });
  });

  describe('Date string format consistency', () => {
    it('should use ISO date strings consistently', () => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const datetimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;

      // Test date fields (YYYY-MM-DD)
      const reportForm: DailyReportForm = {
        clinic_id: 'clinic-1',
        report_date: '2024-01-15',
        total_patients: 0,
        new_patients: 0,
        total_revenue: 0,
        insurance_revenue: 0,
        private_revenue: 0
      };

      expect(reportForm.report_date).toMatch(dateRegex);

      // Test datetime fields (ISO string)
      const aiComment = {
        id: 'comment-1',
        summary: 'Test',
        highlights: [],
        improvements: [],
        suggestions: [],
        created_at: '2024-01-15T10:00:00Z'
      };

      expect(aiComment.created_at).toMatch(datetimeRegex);
    });
  });
});
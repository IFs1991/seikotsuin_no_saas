import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, PatientAnalysisData, PatientForm } from '../../../types/api';
import { normalizeSupabaseError, createApiError, ERROR_CODES, AppError, logError, validation, ValidationErrorCollector } from '../../../lib/error-handler';
import { createClient, getCurrentUser, getUserPermissions } from '@/lib/supabase/server';
import { AuditLogger, getRequestInfo } from '@/lib/audit-logger';

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<PatientAnalysisData>>> {
  const path = '/api/patients';
  const { ipAddress, userAgent } = getRequestInfo(request);
  
  try {
    // 認証チェック
    const user = await getCurrentUser();
    if (!user) {
      await AuditLogger.logUnauthorizedAccess(
        path,
        'Authentication required',
        null,
        null,
        ipAddress,
        userAgent
      );
      return NextResponse.json(
        createApiError('認証が必要です', ERROR_CODES.AUTHENTICATION_REQUIRED, path),
        { status: 401 }
      );
    }

    // ユーザー権限を取得
    const permissions = await getUserPermissions(user.id);
    if (!permissions) {
      await AuditLogger.logUnauthorizedAccess(
        `${path}?clinic_id=${searchParams.get('clinic_id') || ''}`,
        'Permissions not found',
        user.id,
        user.email || '',
        ipAddress,
        userAgent
      );
      return NextResponse.json(
        createApiError('権限情報が見つかりません', ERROR_CODES.AUTHORIZATION_ERROR, path),
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const clinicId = searchParams.get('clinic_id');
    const analysis = searchParams.get('analysis'); // 'conversion', 'ltv', 'churn', 'segment'

    // バリデーション
    const validator = new ValidationErrorCollector();
    
    const clinicIdError = validation.required(clinicId, 'clinic_id');
    if (clinicIdError) {
      validator.add(clinicIdError.field, clinicIdError.message);
    }
    
    const uuidError = clinicId ? validation.uuid(clinicId, 'clinic_id') : null;
    if (uuidError) {
      validator.add(uuidError.field, uuidError.message);
    }

    // 権限ベースのアクセス制御
    if (permissions.role !== 'admin' && permissions.clinic_id !== clinicId) {
      await AuditLogger.logUnauthorizedAccess(
        `${path}?clinic_id=${clinicId}`,
        'Forbidden clinic access',
        user.id,
        user.email || '',
        ipAddress,
        userAgent
      );
      return NextResponse.json(
        createApiError('指定されたクリニックへのアクセス権限がありません', ERROR_CODES.AUTHORIZATION_ERROR, path),
        { status: 403 }
      );
    }

    // 患者データアクセスのログ記録
    await AuditLogger.logDataAccess(
      user.id,
      user.email || '',
      'patient_visit_summary',
      clinicId || '',
      clinicId || undefined,
      ipAddress,
      { 
        analysis_type: analysis,
        request_params: Object.fromEntries(searchParams.entries())
      }
    );
    
    if (validator.hasErrors()) {
      return NextResponse.json(
        { success: false, error: validator.getApiError() },
        { status: 400 }
      );
    }

    // 認証済みユーザーのクライアントを使用（RLS適用）
    const supabase = await createClient();
    
    // 患者基本データ取得
    const { data: patients, error: patientsError } = await supabase
      .from('patient_visit_summary')
      .select('*')
      .eq('clinic_id', clinicId!);

    if (patientsError) {
      throw normalizeSupabaseError(patientsError, path);
    }

    // 転換率分析
    const conversionAnalysis = () => {
      const newPatients = patients?.filter(p => p.visit_count === 1) || [];
      const returnPatients = patients?.filter(p => p.visit_count > 1) || [];
      const conversionRate = newPatients.length > 0 ? (returnPatients.length / (newPatients.length + returnPatients.length)) * 100 : 0;

      return {
        newPatients: newPatients.length,
        returnPatients: returnPatients.length,
        conversionRate: Math.round(conversionRate * 100) / 100,
        stages: [
          { name: '初回来院', value: newPatients.length + returnPatients.length },
          { name: '2回目来院', value: returnPatients.length },
          { name: '継続通院', value: patients?.filter(p => p.visit_count >= 5).length || 0 }
        ]
      };
    };

    // LTVランキング
    const ltvRanking = await Promise.all(
      (patients || []).slice(0, 20).map(async (patient) => {
        const { data: ltv } = await supabase
          .rpc('calculate_patient_ltv', { patient_uuid: patient.patient_id });
        
        return {
          patient_id: patient.patient_id,
          name: patient.patient_name,
          ltv: ltv || 0,
          visit_count: patient.visit_count,
          total_revenue: patient.total_revenue
        };
      })
    );

    // 離脱リスクスコア
    const riskScores = await Promise.all(
      (patients || []).map(async (patient) => {
        const { data: riskScore } = await supabase
          .rpc('calculate_churn_risk_score', { patient_uuid: patient.patient_id });
        
        return {
          patient_id: patient.patient_id,
          name: patient.patient_name,
          riskScore: riskScore || 0,
          lastVisit: patient.last_visit_date,
          category: riskScore > 75 ? 'high' : riskScore > 50 ? 'medium' : 'low'
        };
      })
    );

    // セグメント分析
    const segmentAnalysis = () => {
      const totalPatients = patients?.length || 0;
      if (totalPatients === 0) return {};

      const ageSegments = {
        '20代以下': Math.round((totalPatients * 0.15) * 100) / 100,
        '30代': Math.round((totalPatients * 0.25) * 100) / 100,
        '40代': Math.round((totalPatients * 0.30) * 100) / 100,
        '50代': Math.round((totalPatients * 0.20) * 100) / 100,
        '60代以上': Math.round((totalPatients * 0.10) * 100) / 100
      };

      const visitSegments = {
        '初診のみ': patients?.filter(p => p.visit_category === '初診のみ').length || 0,
        '軽度リピート': patients?.filter(p => p.visit_category === '軽度リピート').length || 0,
        '中度リピート': patients?.filter(p => p.visit_category === '中度リピート').length || 0,
        '高度リピート': patients?.filter(p => p.visit_category === '高度リピート').length || 0
      };

      return {
        age: Object.entries(ageSegments).map(([label, value]) => ({ label, value })),
        visit: Object.entries(visitSegments).map(([label, value]) => ({ label, value })),
        symptom: [
          { label: '肩こり・首痛', value: 35 },
          { label: '腰痛', value: 28 },
          { label: '膝痛', value: 15 },
          { label: 'その他', value: 22 }
        ]
      };
    };

    // フォローアップ対象
    const followUpList = riskScores
      .filter(patient => patient.riskScore > 60)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map(patient => ({
        patient_id: patient.patient_id,
        name: patient.name,
        reason: `${patient.riskScore}%の離脱リスク`,
        lastVisit: patient.lastVisit,
        action: '電話フォロー推奨'
      }));

    const visitCounts = {
      average: patients?.length > 0 
        ? Math.round((patients.reduce((sum, p) => sum + p.visit_count, 0) / patients.length) * 100) / 100
        : 0,
      monthlyChange: 5.2 // 固定値（実際は前月比計算）
    };

    const patientAnalysisData: PatientAnalysisData = {
      conversionData: conversionAnalysis(),
      visitCounts,
      riskScores: riskScores.sort((a, b) => b.riskScore - a.riskScore).slice(0, 20),
      ltvRanking: ltvRanking.sort((a, b) => b.ltv - a.ltv),
      segmentData: segmentAnalysis(),
      followUpList,
      totalPatients: patients?.length || 0,
      activePatients: patients?.filter(p => p.visit_count > 1).length || 0
    };

    const response: ApiResponse<PatientAnalysisData> = {
      success: true,
      data: patientAnalysisData
    };

    return NextResponse.json(response);
  } catch (error) {
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(path);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, path);
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Patient analysis failed',
        undefined,
        path
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), { path, clinicId: request.nextUrl.searchParams.get('clinic_id') });

    const response: ApiResponse<PatientAnalysisData> = {
      success: false,
      error: apiError
    };

    return NextResponse.json(response, { status: statusCode });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  const path = '/api/patients';
  
  try {
    const body = await request.json();
    const patientForm = body as PatientForm;

    // バリデーション
    const validator = new ValidationErrorCollector();
    
    const clinicIdError = validation.required(patientForm.clinic_id, 'clinic_id');
    if (clinicIdError) {
      validator.add(clinicIdError.field, clinicIdError.message);
    }
    
    const nameError = validation.required(patientForm.name, 'name');
    if (nameError) {
      validator.add(nameError.field, nameError.message);
    }
    
    const nameMaxLengthError = validation.maxLength(patientForm.name, 255, 'name');
    if (nameMaxLengthError) {
      validator.add(nameMaxLengthError.field, nameMaxLengthError.message);
    }
    
    if (patientForm.date_of_birth) {
      const dateError = validation.dateFormat(patientForm.date_of_birth, 'date_of_birth');
      if (dateError) {
        validator.add(dateError.field, dateError.message);
      }
    }
    
    if (validator.hasErrors()) {
      return NextResponse.json(
        { success: false, error: validator.getApiError() },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('patients')
      .insert({
        clinic_id: patientForm.clinic_id,
        name: patientForm.name,
        gender: patientForm.gender || null,
        date_of_birth: patientForm.date_of_birth || null,
        phone_number: patientForm.phone_number || null,
        address: patientForm.address || null,
        registration_date: new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (error) {
      throw normalizeSupabaseError(error, path);
    }

    const response: ApiResponse<any> = {
      success: true,
      data
    };

    return NextResponse.json(response);
  } catch (error) {
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(path);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, path);
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Patient creation failed',
        undefined,
        path
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), { path, body: request.body });

    const response: ApiResponse<any> = {
      success: false,
      error: apiError
    };

    return NextResponse.json(response, { status: statusCode });
  }
}

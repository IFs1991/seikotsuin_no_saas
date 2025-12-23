# TypeScript Errors Summary

Generated: 2025-12-18T07:48:43

## Totals
- Error count: 565
- Files affected: 95

## Top Files
| File | Errors |
|---|---:|
| src/lib/security-monitor.ts | 27 |
| src/app/api/staff/route.ts | 27 |
| src/app/api/daily-reports/route.ts | 27 |
| src/lib/services/reservation-service.ts | 26 |
| src/lib/mfa/mfa-manager.ts | 21 |
| src/app/api/dashboard/route.ts | 21 |
| src/lib/multi-device-manager.ts | 20 |
| src/lib/session-manager.ts | 19 |
| src/app/api/reservations/route.ts | 18 |
| src/app/api/revenue/route.ts | 16 |
| src/app/api/ai-comments/route.ts | 16 |
| src/app/api/admin/security/stats/route.ts | 15 |
| src/lib/mfa/backup-codes.ts | 12 |
| src/components/admin/communication-settings.tsx | 11 |
| src/lib/rate-limiting/rate-limiter.ts | 10 |
| src/lib/notifications/security-alerts.ts | 9 |
| src/components/admin/data-form-dialog.tsx | 9 |
| src/hooks/useChat.ts | 8 |
| src/components/admin/clinic-hours-settings.tsx | 8 |
| src/app/api/beta/metrics/route.ts | 8 |
| src/app/api/beta/feedback/route.ts | 8 |
| src/lib/middleware-optimizer.ts | 7 |
| src/components/ui/swipe-handler.tsx | 7 |
| src/app/api/beta/backlog/route.ts | 7 |
| src/app/multi-store/page.tsx | 7 |
| src/components/admin/insurance-billing-settings.tsx | 7 |
| src/lib/services/block-service.ts | 7 |
| src/hooks/useQualityAssurance.ts | 7 |
| src/hooks/useMultiStore.ts | 6 |
| src/lib/rate-limiting/middleware.ts | 6 |

## Top Error Codes
| Code | Count |
|---|---:|
| TS2339 | 264 |
| TS6133 | 80 |
| TS2345 | 51 |
| TS2769 | 27 |
| TS2322 | 21 |
| TS2375 | 21 |
| TS18048 | 19 |
| TS2532 | 16 |
| TS2379 | 12 |
| TS7006 | 11 |
| TS18004 | 5 |
| TS2353 | 5 |
| TS2614 | 3 |
| TS7053 | 3 |
| TS2344 | 2 |
| TS18046 | 2 |
| TS6196 | 2 |
| TS2352 | 2 |
| TS2341 | 2 |
| TS2538 | 2 |
| TS2561 | 2 |
| TS2554 | 2 |
| TS7030 | 2 |
| TS2578 | 2 |
| TS2571 | 1 |
| TS2698 | 1 |
| TS2306 | 1 |
| TS2304 | 1 |
| TS6192 | 1 |
| TS6198 | 1 |

## Errors By File (first 20 each)

### src/lib/security-monitor.ts (27)
- TS6133 at src/lib/security-monitor.ts11:8: 'DeviceInfo' is declared but its value is never read.
- TS2379 at src/lib/security-monitor.ts88:20: Argument of type '{ threatType: "brute_force"; severity: "medium" | "high"; description: string; evidence: { ipAddress: string; confidence: number; reasons: string[]; }; userId: string | undefined; clinicId: string | undefined; ipAddress: string; timestamp: Date; }' is not assignable to parameter of type 'SecurityThreat' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2379 at src/lib/security-monitor.ts111:22: Argument of type '{ threatType: "location_anomaly"; severity: "low" | "medium"; description: string; evidence: { ipAddress: string; confidence: number; reasons: string[]; }; userId: string; clinicId: string | undefined; ipAddress: string; timestamp: Date; }' is not assignable to parameter of type 'SecurityThreat' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2379 at src/lib/security-monitor.ts135:22: Argument of type '{ threatType: "multiple_devices"; severity: "medium"; description: string; evidence: { userId: string; userAgent: string; confidence: number; reasons: string[]; }; userId: string; clinicId: string | undefined; ipAddress: string; timestamp: Date; }' is not assignable to parameter of type 'SecurityThreat' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2379 at src/lib/security-monitor.ts174:20: Argument of type '{ threatType: "session_hijack"; severity: "medium" | "high"; description: string; evidence: { sessionId: string; originalIp: string; currentIp: string | undefined; confidence: number; reasons: string[]; }; userId: string; clinicId: string; ipAddress: string | undefined; timestamp: Date; }' is not assignable to parameter of type 'SecurityThreat' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2379 at src/lib/security-monitor.ts201:35: Argument of type '{ user_id: string | undefined; clinic_id: string | undefined; event_type: string; event_category: string; severity_level: string; event_description: string; event_data: { threat_type: "suspicious_login" | ... 3 more ... | "brute_force"; evidence: unknown; }; ip_address: string | undefined; source_component: string; }' is not assignable to parameter of type '{ user_id?: string; clinic_id?: string; session_id?: string; event_type: string; event_category: string; severity_level: string; event_description: string; event_data?: any; ip_address?: string; user_agent?: string; source_component: string; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2339 at src/lib/security-monitor.ts255:17: Property 'id' does not exist on type 'never'.
- TS2339 at src/lib/security-monitor.ts256:25: Property 'event_type' does not exist on type 'never'.
- TS2339 at src/lib/security-monitor.ts257:45: Property 'severity_level' does not exist on type 'never'.
- TS2339 at src/lib/security-monitor.ts258:44: Property 'event_type' does not exist on type 'never'.
- TS2339 at src/lib/security-monitor.ts259:26: Property 'event_description' does not exist on type 'never'.
- TS2339 at src/lib/security-monitor.ts260:21: Property 'user_id' does not exist on type 'never'.
- TS2339 at src/lib/security-monitor.ts261:23: Property 'clinic_id' does not exist on type 'never'.
- TS2339 at src/lib/security-monitor.ts263:33: Property 'created_at' does not exist on type 'never'.
- TS2339 at src/lib/security-monitor.ts312:26: Property 'event_type' does not exist on type 'never'.
- TS2339 at src/lib/security-monitor.ts313:29: Property 'event_type' does not exist on type 'never'.
- TS2339 at src/lib/security-monitor.ts316:35: Property 'created_at' does not exist on type 'never'.
- TS2538 at src/lib/security-monitor.ts317:19: Type 'undefined' cannot be used as an index type.
- TS2538 at src/lib/security-monitor.ts317:40: Type 'undefined' cannot be used as an index type.
- TS2339 at src/lib/security-monitor.ts321:15: Property 'severity_level' does not exist on type 'never'.

### src/app/api/staff/route.ts (27)
- TS2339 at src/app/api/staff/route.ts68:34: Property 'total_visits' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts68:64: Property 'working_days' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts73:40: Property 'total_revenue_generated' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts78:31: Property 'average_satisfaction_score' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts87:16: Property 'total_revenue_generated' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts87:51: Property 'total_revenue_generated' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts91:27: Property 'staff_id' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts92:23: Property 'staff_name' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts93:26: Property 'total_revenue_generated' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts94:27: Property 'unique_patients' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts95:31: Property 'average_satisfaction_score' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts100:21: Property 'staff_name' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts101:29: Property 'average_satisfaction_score' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts102:24: Property 'total_revenue_generated' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts103:25: Property 'unique_patients' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts109:36: Property 'staff' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts114:26: Property 'performance_date' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts115:29: Property 'revenue_generated' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts116:30: Property 'patient_count' does not exist on type 'never'.
- TS2339 at src/app/api/staff/route.ts117:34: Property 'satisfaction_score' does not exist on type 'never'.

### src/app/api/daily-reports/route.ts (27)
- TS2339 at src/app/api/daily-reports/route.ts53:22: Property 'id' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts54:30: Property 'report_date' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts55:29: Property 'staff' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts56:33: Property 'total_patients' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts57:31: Property 'new_patients' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts58:43: Property 'total_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts59:47: Property 'insurance_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts60:45: Property 'private_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts61:30: Property 'report_text' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts62:29: Property 'created_at' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts98:49: Property 'total_patients' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts104:46: Property 'total_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts110:42: Property 'total_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts119:32: Property 'report_date' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts129:46: Property 'total_patients' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts130:56: Property 'total_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts141:24: Property 'id' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts142:32: Property 'report_date' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts143:31: Property 'staff' does not exist on type 'never'.
- TS2339 at src/app/api/daily-reports/route.ts144:35: Property 'total_patients' does not exist on type 'never'.

### src/lib/services/reservation-service.ts (26)
- TS6196 at src/lib/services/reservation-service.ts9:3: 'Customer' is declared but never used.
- TS6196 at src/lib/services/reservation-service.ts10:3: 'Menu' is declared but never used.
- TS2339 at src/lib/services/reservation-service.ts31:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/reservation-service.ts49:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/reservation-service.ts70:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/reservation-service.ts86:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/reservation-service.ts100:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2345 at src/lib/services/reservation-service.ts132:32: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
- TS2345 at src/lib/services/reservation-service.ts133:34: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
- TS2345 at src/lib/services/reservation-service.ts134:30: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
- TS2345 at src/lib/services/reservation-service.ts135:32: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
- TS2339 at src/lib/services/reservation-service.ts168:47: Property 'customerName' does not exist on type 'Reservation'.
- TS2339 at src/lib/services/reservation-service.ts200:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2375 at src/lib/services/reservation-service.ts221:13: Type '{ customerId: string; menuId: string; staffId: string; startTime: Date; endTime: Date; channel: "phone" | "line" | "web" | "walk_in"; notes: string | undefined; createdBy: string; }' is not assignable to type 'CreateReservationData' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2339 at src/lib/services/reservation-service.ts242:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/reservation-service.ts257:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/reservation-service.ts272:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/reservation-service.ts287:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/reservation-service.ts303:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/reservation-service.ts320:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.

### src/lib/mfa/mfa-manager.ts (21)
- TS2769 at src/lib/mfa/mfa-manager.ts97:49: No overload matches this call.
- TS2339 at src/lib/mfa/mfa-manager.ts150:30: Property 'secret_key' does not exist on type 'never'.
- TS2769 at src/lib/mfa/mfa-manager.ts162:49: No overload matches this call.
- TS2339 at src/lib/mfa/mfa-manager.ts164:33: Property 'clinic_id' does not exist on type 'never'.
- TS2339 at src/lib/mfa/mfa-manager.ts165:34: Property 'secret_key' does not exist on type 'never'.
- TS2339 at src/lib/mfa/mfa-manager.ts166:36: Property 'backup_codes' does not exist on type 'never'.
- TS2339 at src/lib/mfa/mfa-manager.ts177:32: Property 'id' does not exist on type 'never'.
- TS2339 at src/lib/mfa/mfa-manager.ts219:29: Property 'secret_key' does not exist on type 'never'.
- TS2345 at src/lib/mfa/mfa-manager.ts230:19: Argument of type '{ last_used_at: string; }' is not assignable to parameter of type 'never'.
- TS2339 at src/lib/mfa/mfa-manager.ts283:39: Property 'backup_codes' does not exist on type 'never'.
- TS2345 at src/lib/mfa/mfa-manager.ts303:17: Argument of type '{ backup_codes: any[]; last_used_at: string; }' is not assignable to parameter of type 'never'.
- TS2375 at src/lib/mfa/mfa-manager.ts355:7: Type '{ isEnabled: any; hasBackupCodes: boolean; lastUsed: Date | undefined; setupCompletedAt: Date | undefined; }' is not assignable to type 'MFAStatus' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2339 at src/lib/mfa/mfa-manager.ts356:32: Property 'is_enabled' does not exist on type 'never'.
- TS2339 at src/lib/mfa/mfa-manager.ts357:38: Property 'backup_codes' does not exist on type 'never'.
- TS2339 at src/lib/mfa/mfa-manager.ts358:31: Property 'last_used_at' does not exist on type 'never'.
- TS2339 at src/lib/mfa/mfa-manager.ts359:34: Property 'last_used_at' does not exist on type 'never'.
- TS2339 at src/lib/mfa/mfa-manager.ts361:39: Property 'setup_completed_at' does not exist on type 'never'.
- TS2339 at src/lib/mfa/mfa-manager.ts362:34: Property 'setup_completed_at' does not exist on type 'never'.
- TS2345 at src/lib/mfa/mfa-manager.ts382:17: Argument of type '{ is_enabled: boolean; disabled_at: string; disabled_by: string; }' is not assignable to parameter of type 'never'.
- TS2345 at src/lib/mfa/mfa-manager.ts423:17: Argument of type '{ backup_codes: string[]; backup_codes_regenerated_at: string; }' is not assignable to parameter of type 'never'.

### src/app/api/dashboard/route.ts (21)
- TS2345 at src/app/api/dashboard/route.ts56:27: Argument of type 'string | undefined' is not assignable to parameter of type '{}'.
- TS2345 at src/app/api/dashboard/route.ts85:27: Argument of type 'string | undefined' is not assignable to parameter of type '{}'.
- TS2345 at src/app/api/dashboard/route.ts110:7: Argument of type '{ clinic_uuid: string; }' is not assignable to parameter of type 'undefined'.
- TS2345 at src/app/api/dashboard/route.ts129:27: Argument of type 'string | undefined' is not assignable to parameter of type '{}'.
- TS2339 at src/app/api/dashboard/route.ts148:40: Property 'total_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts150:43: Property 'total_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts188:41: Property 'insurance_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts189:39: Property 'private_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts193:27: Property 'id' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts194:32: Property 'summary' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts195:35: Property 'good_points' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts195:60: Property 'good_points' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts196:37: Property 'improvement_points' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts197:28: Property 'improvement_points' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts199:36: Property 'suggestion_for_tomorrow' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts200:28: Property 'suggestion_for_tomorrow' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts202:35: Property 'created_at' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts207:22: Property 'revenue_date' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts208:28: Property 'total_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/dashboard/route.ts209:29: Property 'insurance_revenue' does not exist on type 'never'.

### src/lib/multi-device-manager.ts (20)
- TS6133 at src/lib/multi-device-manager.ts7:1: 'createBrowserClient' is declared but its value is never read.
- TS6133 at src/lib/multi-device-manager.ts10:8: 'UserSession' is declared but its value is never read.
- TS6133 at src/lib/multi-device-manager.ts72:11: 'securityMonitor' is declared but its value is never read.
- TS2339 at src/lib/multi-device-manager.ts90:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2578 at src/lib/multi-device-manager.ts102:11: Unused '@ts-expect-error' directive.
- TS2339 at src/lib/multi-device-manager.ts141:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS7006 at src/lib/multi-device-manager.ts168:27: Parameter 'session' implicitly has an 'any' type.
- TS2375 at src/lib/multi-device-manager.ts329:5: Type '{ totalDevices: number; activeDevices: number; trustedDevices: number; suspiciousDevices: number; lastSyncAt: Date | undefined; }' is not assignable to type '{ totalDevices: number; activeDevices: number; trustedDevices: number; suspiciousDevices: number; lastSyncAt?: Date; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2532 at src/lib/multi-device-manager.ts334:40: Object is possibly 'undefined'.
- TS2339 at src/lib/multi-device-manager.ts408:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/multi-device-manager.ts444:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/multi-device-manager.ts463:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS7006 at src/lib/multi-device-manager.ts475:41: Parameter 's' implicitly has an 'any' type.
- TS7006 at src/lib/multi-device-manager.ts476:27: Parameter 'ip' implicitly has an 'any' type.
- TS6133 at src/lib/multi-device-manager.ts498:5: 'deviceInfo' is declared but its value is never read.
- TS2339 at src/lib/multi-device-manager.ts521:43: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/multi-device-manager.ts545:43: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/multi-device-manager.ts563:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/multi-device-manager.ts610:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2322 at src/lib/multi-device-manager.ts657:28: Type 'string | undefined' is not assignable to type 'string | null'.

### src/lib/session-manager.ts (19)
- TS2375 at src/lib/session-manager.ts105:5: Type '{ id: string; user_id: string; clinic_id: string; session_token: string; device_info: DeviceInfo; ip_address: string; user_agent: string | undefined; geolocation: Geolocation | undefined; ... 9 more ...; remember_device: boolean; }' is not assignable to type 'UserSession' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2339 at src/lib/session-manager.ts252:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2375 at src/lib/session-manager.ts300:5: Type '{ id: string; user_id: string; clinic_id: string; session_token: string; device_info: DeviceInfo; ip_address: string; user_agent: string | undefined; geolocation: Geolocation | undefined; ... 9 more ...; remember_device: boolean; }' is not assignable to type 'UserSession' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2375 at src/lib/session-manager.ts367:13: Type '{ user_id: string; clinic_id: string; session_token: string; device_info: Record<string, unknown>; ip_address: string | null; user_agent: string | null; geolocation: Record<string, unknown> | null | undefined; ... 11 more ...; created_by: string; }' is not assignable to type '{ id?: string; user_id: string; clinic_id: string; session_token: string; refresh_token_id?: string | null; device_info?: Record<string, unknown>; ip_address?: string | null; user_agent?: string | null; ... 15 more ...; updated_at?: string; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2339 at src/lib/session-manager.ts390:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2379 at src/lib/session-manager.ts402:44: Argument of type '{ id: any; userId: string; clinicId: string; sessionToken: string; deviceInfo: DeviceInfo; ipAddress: string | undefined; userAgent: string | undefined; geolocation: Geolocation | undefined; ... 9 more ...; isRevoked: any; }' is not assignable to parameter of type '{ id?: string; userId: string; clinicId: string; sessionToken: string; deviceInfo: DeviceInfo; ipAddress?: string; userAgent?: string; geolocation?: Geolocation; createdAt: string; ... 8 more ...; isRevoked?: boolean; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2379 at src/lib/session-manager.ts461:62: Argument of type '{ userId: string; clinicId: string; sessionToken: string; deviceInfo: DeviceInfo; ipAddress: string | undefined; userAgent: string | undefined; geolocation: Geolocation | undefined; ... 7 more ...; rememberDevice: boolean; }' is not assignable to parameter of type '{ id?: string; userId: string; clinicId: string; sessionToken: string; deviceInfo: DeviceInfo; ipAddress?: string; userAgent?: string; geolocation?: Geolocation; createdAt: string; ... 8 more ...; isRevoked?: boolean; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2339 at src/lib/session-manager.ts497:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/session-manager.ts577:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/session-manager.ts602:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/session-manager.ts620:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/session-manager.ts659:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS7006 at src/lib/session-manager.ts670:25: Parameter 'row' implicitly has an 'any' type.
- TS2339 at src/lib/session-manager.ts681:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/session-manager.ts706:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/session-manager.ts747:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/session-manager.ts786:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/session-manager.ts804:10: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/session-manager.ts866:27: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.

### src/app/api/reservations/route.ts (18)
- TS2339 at src/app/api/reservations/route.ts88:18: Property 'id' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts89:26: Property 'customer_id' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts90:28: Property 'customer_name' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts91:22: Property 'menu_id' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts92:24: Property 'menu_name' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts93:23: Property 'staff_id' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts94:25: Property 'staff_name' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts95:25: Property 'start_time' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts96:23: Property 'end_time' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts97:22: Property 'status' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts98:23: Property 'channel' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts99:21: Property 'notes' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts100:31: Property 'selected_options' does not exist on type 'never'.
- TS2769 at src/app/api/reservations/route.ts180:15: No overload matches this call.
- TS2339 at src/app/api/reservations/route.ts232:51: Property 'staff_id' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts233:55: Property 'start_time' does not exist on type 'never'.
- TS2339 at src/app/api/reservations/route.ts234:51: Property 'end_time' does not exist on type 'never'.
- TS2345 at src/app/api/reservations/route.ts252:15: Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'never'.

### src/app/api/revenue/route.ts (16)
- TS2339 at src/app/api/revenue/route.ts56:39: Property 'gte' does not exist on type '{}'.
- TS2339 at src/app/api/revenue/route.ts66:31: Property 'master_treatment_menus' does not exist on type 'never'.
- TS2339 at src/app/api/revenue/route.ts69:27: Property 'treatment_menu_id' does not exist on type 'never'.
- TS2339 at src/app/api/revenue/route.ts75:56: Property 'amount' does not exist on type 'never'.
- TS2339 at src/app/api/revenue/route.ts89:27: Property 'revenue_date' does not exist on type 'never'.
- TS2339 at src/app/api/revenue/route.ts99:52: Property 'amount' does not exist on type 'never'.
- TS2339 at src/app/api/revenue/route.ts100:56: Property 'insurance_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/revenue/route.ts101:54: Property 'private_revenue' does not exist on type 'never'.
- TS6133 at src/app/api/revenue/route.ts114:41: 'hourlyError' is declared but its value is never read.
- TS2345 at src/app/api/revenue/route.ts116:7: Argument of type '{ clinic_uuid: string; }' is not assignable to parameter of type 'undefined'.
- TS6133 at src/app/api/revenue/route.ts122:40: 'lastYearError' is declared but its value is never read.
- TS2339 at src/app/api/revenue/route.ts135:64: Property 'amount' does not exist on type 'never'.
- TS2339 at src/app/api/revenue/route.ts137:65: Property 'amount' does not exist on type 'never'.
- TS2339 at src/app/api/revenue/route.ts160:50: Property 'insurance_revenue' does not exist on type 'never'.
- TS2339 at src/app/api/revenue/route.ts165:50: Property 'private_revenue' does not exist on type 'never'.
- TS2769 at src/app/api/revenue/route.ts219:8: No overload matches this call.

### src/app/api/ai-comments/route.ts (16)
- TS2345 at src/app/api/ai-comments/route.ts28:27: Argument of type 'string | undefined' is not assignable to parameter of type '{}'.
- TS2345 at src/app/api/ai-comments/route.ts39:9: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
- TS2339 at src/app/api/ai-comments/route.ts50:18: Property 'id' does not exist on type 'never'.
- TS2339 at src/app/api/ai-comments/route.ts51:23: Property 'summary' does not exist on type 'never'.
- TS2339 at src/app/api/ai-comments/route.ts52:26: Property 'good_points' does not exist on type 'never'.
- TS2339 at src/app/api/ai-comments/route.ts52:46: Property 'good_points' does not exist on type 'never'.
- TS2339 at src/app/api/ai-comments/route.ts53:28: Property 'improvement_points' does not exist on type 'never'.
- TS2339 at src/app/api/ai-comments/route.ts53:55: Property 'improvement_points' does not exist on type 'never'.
- TS2339 at src/app/api/ai-comments/route.ts54:27: Property 'suggestion_for_tomorrow' does not exist on type 'never'.
- TS2339 at src/app/api/ai-comments/route.ts55:19: Property 'suggestion_for_tomorrow' does not exist on type 'never'.
- TS2339 at src/app/api/ai-comments/route.ts57:26: Property 'created_at' does not exist on type 'never'.
- TS2345 at src/app/api/ai-comments/route.ts142:27: Argument of type 'string | undefined' is not assignable to parameter of type '{}'.
- TS2769 at src/app/api/ai-comments/route.ts170:8: No overload matches this call.
- TS2339 at src/app/api/ai-comments/route.ts192:24: Property 'id' does not exist on type 'never'.
- TS2339 at src/app/api/ai-comments/route.ts197:32: Property 'created_at' does not exist on type 'never'.
- TS6133 at src/app/api/ai-comments/route.ts225:9: 'weeklyAvgPatients' is declared but its value is never read.

### src/app/api/admin/security/stats/route.ts (15)
- TS18048 at src/app/api/admin/security/stats/route.ts50:35: 'days' is possibly 'undefined'.
- TS2339 at src/app/api/admin/security/stats/route.ts107:42: Property 'severity_level' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts108:29: Property 'created_at' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts115:19: Property 'id' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts116:27: Property 'event_type' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts118:24: Property 'user_id' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts119:26: Property 'clinic_id' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts120:27: Property 'ip_address' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts121:27: Property 'created_at' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts122:34: Property 'event_description' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts135:18: Property 'event_type' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts138:18: Property 'event_type' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts142:13: Property 'event_type' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts148:25: Property 'user_id' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/stats/route.ts151:29: Property 'user_id' does not exist on type 'never'.

### src/lib/mfa/backup-codes.ts (12)
- TS2339 at src/lib/mfa/backup-codes.ts126:40: Property 'backup_codes' does not exist on type 'never'.
- TS2345 at src/lib/mfa/backup-codes.ts151:17: Argument of type '{ backup_codes: string[]; last_used_at: string; }' is not assignable to parameter of type 'never'.
- TS2339 at src/lib/mfa/backup-codes.ts201:40: Property 'backup_codes' does not exist on type 'never'.
- TS2375 at src/lib/mfa/backup-codes.ts205:7: Type '{ totalGenerated: 10; totalUsed: number; remainingCount: number; lastUsed: Date | undefined; generatedAt: Date; warningLevel: "low" | "critical" | "none"; }' is not assignable to type 'BackupCodeUsage' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2339 at src/lib/mfa/backup-codes.ts209:31: Property 'last_used_at' does not exist on type 'never'.
- TS2339 at src/lib/mfa/backup-codes.ts210:34: Property 'last_used_at' does not exist on type 'never'.
- TS2339 at src/lib/mfa/backup-codes.ts213:23: Property 'setup_completed_at' does not exist on type 'never'.
- TS2339 at src/lib/mfa/backup-codes.ts213:57: Property 'created_at' does not exist on type 'never'.
- TS2345 at src/lib/mfa/backup-codes.ts240:17: Argument of type '{ backup_codes: string[]; backup_codes_regenerated_at: string; }' is not assignable to parameter of type 'never'.
- TS2339 at src/lib/mfa/backup-codes.ts295:29: Property 'backup_codes' does not exist on type 'never'.
- TS2339 at src/lib/mfa/backup-codes.ts323:31: Property 'user_id' does not exist on type 'never'.
- TS2769 at src/lib/mfa/backup-codes.ts418:46: No overload matches this call.

### src/components/admin/communication-settings.tsx (11)
- TS6133 at src/components/admin/communication-settings.tsx33:21: 'setTemplates' is declared but its value is never read.
- TS2353 at src/components/admin/communication-settings.tsx212:29: Object literal may only specify known properties, and 'patientName' does not exist in type 'ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<...>'.
- TS18004 at src/components/admin/communication-settings.tsx212:29: No value exists in scope for the shorthand property 'patientName'. Either declare one or provide an initializer.
- TS2353 at src/components/admin/communication-settings.tsx212:48: Object literal may only specify known properties, and 'appointmentDate' does not exist in type 'ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<...>'.
- TS18004 at src/components/admin/communication-settings.tsx212:48: No value exists in scope for the shorthand property 'appointmentDate'. Either declare one or provide an initializer.
- TS2353 at src/components/admin/communication-settings.tsx213:20: Object literal may only specify known properties, and 'appointmentTime' does not exist in type 'ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<...>'.
- TS18004 at src/components/admin/communication-settings.tsx213:20: No value exists in scope for the shorthand property 'appointmentTime'. Either declare one or provide an initializer.
- TS2353 at src/components/admin/communication-settings.tsx213:43: Object literal may only specify known properties, and 'staffName' does not exist in type 'ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<...>'.
- TS18004 at src/components/admin/communication-settings.tsx213:43: No value exists in scope for the shorthand property 'staffName'. Either declare one or provide an initializer.
- TS2353 at src/components/admin/communication-settings.tsx213:60: Object literal may only specify known properties, and 'serviceName' does not exist in type 'ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<...>'.
- TS18004 at src/components/admin/communication-settings.tsx213:60: No value exists in scope for the shorthand property 'serviceName'. Either declare one or provide an initializer.

### src/lib/rate-limiting/rate-limiter.ts (10)
- TS2339 at src/lib/rate-limiting/rate-limiter.ts108:16: Property 'MAX_ATTEMPTS' does not exist on type '{ readonly WINDOW: 900; readonly MAX_ATTEMPTS: 5; readonly BLOCK_DURATION: readonly [60, 300, 3600, 86400]; } | { readonly WINDOW: 60; readonly MAX_CALLS: 100; readonly BURST_LIMIT: 10; } | { ...; } | { ...; }'.
- TS2339 at src/lib/rate-limiting/rate-limiter.ts109:16: Property 'MAX_CALLS' does not exist on type '{ readonly WINDOW: 900; readonly MAX_ATTEMPTS: 5; readonly BLOCK_DURATION: readonly [60, 300, 3600, 86400]; } | { readonly WINDOW: 60; readonly MAX_CALLS: 100; readonly BURST_LIMIT: 10; } | { ...; } | { ...; }'.
- TS2339 at src/lib/rate-limiting/rate-limiter.ts110:16: Property 'MAX_SESSIONS' does not exist on type '{ readonly WINDOW: 900; readonly MAX_ATTEMPTS: 5; readonly BLOCK_DURATION: readonly [60, 300, 3600, 86400]; } | { readonly WINDOW: 60; readonly MAX_CALLS: 100; readonly BURST_LIMIT: 10; } | { ...; } | { ...; }'.
- TS7053 at src/lib/rate-limiting/rate-limiter.ts156:29: Element implicitly has an 'any' type because expression of type '1' can't be used to index type '{}'.
- TS2339 at src/lib/rate-limiting/rate-limiter.ts224:45: Property 'BLOCK_DURATION' does not exist on type '{ readonly WINDOW: 900; readonly MAX_ATTEMPTS: 5; readonly BLOCK_DURATION: readonly [60, 300, 3600, 86400]; } | { readonly WINDOW: 60; readonly MAX_CALLS: 100; readonly BURST_LIMIT: 10; } | { ...; } | { ...; }'.
- TS2339 at src/lib/rate-limiting/rate-limiter.ts226:32: Property 'BLOCK_DURATION' does not exist on type '{ readonly WINDOW: 900; readonly MAX_ATTEMPTS: 5; readonly BLOCK_DURATION: readonly [60, 300, 3600, 86400]; } | { readonly WINDOW: 60; readonly MAX_CALLS: 100; readonly BURST_LIMIT: 10; } | { ...; } | { ...; }'.
- TS2322 at src/lib/rate-limiting/rate-limiter.ts227:7: Type 'number | undefined' is not assignable to type 'number'.
- TS2375 at src/lib/rate-limiting/rate-limiter.ts381:7: Type '{ currentCount: number; isBlocked: boolean; blockLevel: number | undefined; nextResetTime: number; }' is not assignable to type '{ currentCount: number; isBlocked: boolean; blockLevel?: number; nextResetTime: number; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS6133 at src/lib/rate-limiting/rate-limiter.ts401:5: 'ipAddress' is declared but its value is never read.
- TS6133 at src/lib/rate-limiting/rate-limiter.ts402:5: 'allowedCountries' is declared but its value is never read.

### src/lib/notifications/security-alerts.ts (9)
- TS2375 at src/lib/notifications/security-alerts.ts59:11: Type '{ type: "csp_violation"; severity: "low" | "medium" | "high" | "critical"; title: string; message: string; details: { violationId: string; violatedDirective: string; blockedUri: string; documentUri: string; threatScore: number; }; ... 7 more ...; source: string; }' is not assignable to type 'CSPViolationAlert' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2375 at src/lib/notifications/security-alerts.ts94:11: Type '{ type: "rate_limit"; severity: "medium"; title: string; message: string; details: { clientIP: string; userAgent: string | undefined; requestCount: number; timeWindow: string; endpoint: string; }; clientIP: string; userAgent: string | undefined; timestamp: string; source: string; }' is not assignable to type 'SecurityAlert' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2375 at src/lib/notifications/security-alerts.ts158:7: Type '{ success: boolean; channels: string[]; errors: string[] | undefined; }' is not assignable to type 'NotificationResult' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2578 at src/lib/notifications/security-alerts.ts214:5: Unused '@ts-expect-error' directive.
- TS2339 at src/lib/notifications/security-alerts.ts222:25: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS6133 at src/lib/notifications/security-alerts.ts240:13: 'data' is declared but its value is never read.
- TS2339 at src/lib/notifications/security-alerts.ts240:49: Property 'functions' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/notifications/security-alerts.ts260:35: Property 'channel' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/notifications/security-alerts.ts361:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.

### src/components/admin/data-form-dialog.tsx (9)
- TS6192 at src/components/admin/data-form-dialog.tsx15:1: All imports in import declaration are unused.
- TS6133 at src/components/admin/data-form-dialog.tsx87:13: 'name' is declared but its value is never read.
- TS2339 at src/components/admin/data-form-dialog.tsx87:42: Property 'maxLength' does not exist on type 'FormField'.
- TS2339 at src/components/admin/data-form-dialog.tsx87:53: Property 'min' does not exist on type 'FormField'.
- TS2339 at src/components/admin/data-form-dialog.tsx87:58: Property 'max' does not exist on type 'FormField'.
- TS2339 at src/components/admin/data-form-dialog.tsx218:32: Property 'maxLength' does not exist on type 'FormField'.
- TS2339 at src/components/admin/data-form-dialog.tsx244:26: Property 'min' does not exist on type 'FormField'.
- TS2339 at src/components/admin/data-form-dialog.tsx245:26: Property 'max' does not exist on type 'FormField'.
- TS2339 at src/components/admin/data-form-dialog.tsx265:32: Property 'maxLength' does not exist on type 'FormField'.

### src/hooks/useChat.ts (8)
- TS6133 at src/hooks/useChat.ts2:1: 'createClient' is declared but its value is never read.
- TS6133 at src/hooks/useChat.ts3:1: 'generateAnalysisReport' is declared but its value is never read.
- TS2304 at src/hooks/useChat.ts95:32: Cannot find name 'analyzeMessage'.
- TS2339 at src/hooks/useChat.ts145:17: Property 'SpeechRecognition' does not exist on type 'Window & typeof globalThis'.
- TS2339 at src/hooks/useChat.ts145:46: Property 'webkitSpeechRecognition' does not exist on type 'Window & typeof globalThis'.
- TS2339 at src/hooks/useChat.ts154:14: Property 'SpeechRecognition' does not exist on type 'Window & typeof globalThis'.
- TS2339 at src/hooks/useChat.ts154:42: Property 'webkitSpeechRecognition' does not exist on type 'Window & typeof globalThis'.
- TS7006 at src/hooks/useChat.ts160:28: Parameter 'event' implicitly has an 'any' type.

### src/components/admin/clinic-hours-settings.tsx (8)
- TS2532 at src/components/admin/clinic-hours-settings.tsx100:18: Object is possibly 'undefined'.
- TS2532 at src/components/admin/clinic-hours-settings.tsx101:21: Object is possibly 'undefined'.
- TS2345 at src/components/admin/clinic-hours-settings.tsx107:17: Argument of type '(prev: WeekSchedule) => { [x: string]: DaySchedule | { timeSlots: TimeSlot[]; isOpen?: boolean; }; }' is not assignable to parameter of type 'SetStateAction<WeekSchedule>'.
- TS2532 at src/components/admin/clinic-hours-settings.tsx111:24: Object is possibly 'undefined'.
- TS2345 at src/components/admin/clinic-hours-settings.tsx117:17: Argument of type '(prev: WeekSchedule) => { [x: string]: DaySchedule | { timeSlots: TimeSlot[]; isOpen?: boolean; }; }' is not assignable to parameter of type 'SetStateAction<WeekSchedule>'.
- TS2532 at src/components/admin/clinic-hours-settings.tsx121:20: Object is possibly 'undefined'.
- TS2345 at src/components/admin/clinic-hours-settings.tsx132:17: Argument of type '(prev: WeekSchedule) => { [x: string]: DaySchedule | { timeSlots: TimeSlot[]; isOpen?: boolean; }; }' is not assignable to parameter of type 'SetStateAction<WeekSchedule>'.
- TS2532 at src/components/admin/clinic-hours-settings.tsx136:20: Object is possibly 'undefined'.

### src/app/api/beta/metrics/route.ts (8)
- TS2339 at src/app/api/beta/metrics/route.ts78:17: Property 'role' does not exist on type 'never'.
- TS2339 at src/app/api/beta/metrics/route.ts79:45: Property 'clinic_id' does not exist on type 'never'.
- TS2339 at src/app/api/beta/metrics/route.ts144:29: Property 'role' does not exist on type 'never'.
- TS2769 at src/app/api/beta/metrics/route.ts169:8: No overload matches this call.
- TS2339 at src/app/api/beta/metrics/route.ts193:31: Property 'id' does not exist on type 'never'.
- TS2339 at src/app/api/beta/metrics/route.ts228:57: Property 'user_id' does not exist on type 'never'.
- TS2339 at src/app/api/beta/metrics/route.ts274:38: Property 'created_at' does not exist on type 'never'.
- TS2339 at src/app/api/beta/metrics/route.ts275:36: Property 'last_activity' does not exist on type 'never'.

### src/app/api/beta/feedback/route.ts (8)
- TS2339 at src/app/api/beta/feedback/route.ts82:17: Property 'role' does not exist on type 'never'.
- TS2339 at src/app/api/beta/feedback/route.ts83:45: Property 'clinic_id' does not exist on type 'never'.
- TS2339 at src/app/api/beta/feedback/route.ts149:30: Property 'clinic_id' does not exist on type 'never'.
- TS2769 at src/app/api/beta/feedback/route.ts180:8: No overload matches this call.
- TS2339 at src/app/api/beta/feedback/route.ts181:28: Property 'clinic_id' does not exist on type 'never'.
- TS2339 at src/app/api/beta/feedback/route.ts212:31: Property 'id' does not exist on type 'never'.
- TS2339 at src/app/api/beta/feedback/route.ts255:29: Property 'role' does not exist on type 'never'.
- TS2345 at src/app/api/beta/feedback/route.ts295:15: Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'never'.

### src/lib/middleware-optimizer.ts (7)
- TS6133 at src/lib/middleware-optimizer.ts37:5: 'isAdminRoute' is declared but its value is never read.
- TS2739 at src/lib/middleware-optimizer.ts74:9: Type 'PostgrestBuilder<{ PostgrestVersion: "12"; }, never, false>' is missing the following properties from type 'Promise<any>': catch, finally, [Symbol.toStringTag]
- TS2341 at src/lib/middleware-optimizer.ts137:36: Property 'logSecurityEvent' is private and only accessible within class 'SecurityMonitor'.
- TS2561 at src/lib/middleware-optimizer.ts138:11: Object literal may only specify known properties, but 'eventType' does not exist in type '{ user_id?: string; clinic_id?: string; session_id?: string; event_type: string; event_category: string; severity_level: string; event_description: string; event_data?: any; ip_address?: string; user_agent?: string; source_component: string; }'. Did you mean to write 'event_type'?
- TS6133 at src/lib/middleware-optimizer.ts159:5: 'requestPath' is declared but its value is never read.
- TS2532 at src/lib/middleware-optimizer.ts189:14: Object is possibly 'undefined'.
- TS2339 at src/lib/middleware-optimizer.ts204:20: Property 'ip' does not exist on type 'NextRequest'.

### src/components/ui/swipe-handler.tsx (7)
- TS18048 at src/components/ui/swipe-handler.tsx29:34: 'touch' is possibly 'undefined'.
- TS18048 at src/components/ui/swipe-handler.tsx29:52: 'touch' is possibly 'undefined'.
- TS18048 at src/components/ui/swipe-handler.tsx34:32: 'touch' is possibly 'undefined'.
- TS18048 at src/components/ui/swipe-handler.tsx34:50: 'touch' is possibly 'undefined'.
- TS2375 at src/components/ui/swipe-handler.tsx108:6: Type '{ children: Element; onSwipeLeft: () => void; onSwipeRight: () => void; className: string | undefined; }' is not assignable to type 'SwipeHandlerProps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2532 at src/components/ui/swipe-handler.tsx149:27: Object is possibly 'undefined'.
- TS2532 at src/components/ui/swipe-handler.tsx154:22: Object is possibly 'undefined'.

### src/app/api/beta/backlog/route.ts (7)
- TS2339 at src/app/api/beta/backlog/route.ts139:29: Property 'role' does not exist on type 'never'.
- TS2769 at src/app/api/beta/backlog/route.ts167:8: No overload matches this call.
- TS2339 at src/app/api/beta/backlog/route.ts197:29: Property 'id' does not exist on type 'never'.
- TS2339 at src/app/api/beta/backlog/route.ts240:29: Property 'role' does not exist on type 'never'.
- TS2339 at src/app/api/beta/backlog/route.ts285:29: Property 'started_at' does not exist on type 'never'.
- TS2345 at src/app/api/beta/backlog/route.ts298:15: Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'never'.
- TS2339 at src/app/api/beta/backlog/route.ts365:29: Property 'role' does not exist on type 'never'.

### src/app/multi-store/page.tsx (7)
- TS2614 at src/app/multi-store/page.tsx10:10: Module '"../../hooks/useMultiStore"' has no exported member 'useMultiStore'. Did you mean to use 'import useMultiStore from "../../hooks/useMultiStore"' instead?
- TS2614 at src/app/multi-store/page.tsx11:10: Module '"../../components/multi-store/store-comparison-chart"' has no exported member 'StoreComparisonChart'. Did you mean to use 'import StoreComparisonChart from "../../components/multi-store/store-comparison-chart"' instead?
- TS2614 at src/app/multi-store/page.tsx12:10: Module '"../../components/multi-store/best-practice-card"' has no exported member 'BestPracticeCard'. Did you mean to use 'import BestPracticeCard from "../../components/multi-store/best-practice-card"' instead?
- TS7006 at src/app/multi-store/page.tsx86:41: Parameter 'kpi' implicitly has an 'any' type.
- TS7006 at src/app/multi-store/page.tsx86:46: Parameter 'index' implicitly has an 'any' type.
- TS7006 at src/app/multi-store/page.tsx146:38: Parameter 'practice' implicitly has an 'any' type.
- TS7006 at src/app/multi-store/page.tsx146:48: Parameter 'index' implicitly has an 'any' type.

### src/components/admin/insurance-billing-settings.tsx (7)
- TS6133 at src/components/admin/insurance-billing-settings.tsx10:3: 'Plus' is declared but its value is never read.
- TS6133 at src/components/admin/insurance-billing-settings.tsx11:3: 'Edit' is declared but its value is never read.
- TS6133 at src/components/admin/insurance-billing-settings.tsx14:3: 'Building2' is declared but its value is never read.
- TS2375 at src/components/admin/insurance-billing-settings.tsx38:5: Type '{ id: string; name: string; code: string; isEnabled: true; coPaymentRate: number; maxAmount: undefined; }' is not assignable to type 'InsuranceType' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2375 at src/components/admin/insurance-billing-settings.tsx46:5: Type '{ id: string; name: string; code: string; isEnabled: true; coPaymentRate: number; maxAmount: undefined; }' is not assignable to type 'InsuranceType' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2375 at src/components/admin/insurance-billing-settings.tsx54:5: Type '{ id: string; name: string; code: string; isEnabled: true; coPaymentRate: number; maxAmount: undefined; }' is not assignable to type 'InsuranceType' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2375 at src/components/admin/insurance-billing-settings.tsx70:5: Type '{ id: string; name: string; code: string; isEnabled: true; coPaymentRate: number; maxAmount: undefined; }' is not assignable to type 'InsuranceType' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.

### src/lib/services/block-service.ts (7)
- TS2339 at src/lib/services/block-service.ts29:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/block-service.ts48:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/block-service.ts77:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/block-service.ts106:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/block-service.ts130:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/block-service.ts150:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.
- TS2339 at src/lib/services/block-service.ts174:8: Property 'from' does not exist on type 'Promise<SupabaseServerClient>'.

### src/hooks/useQualityAssurance.ts (7)
- TS2345 at src/hooks/useQualityAssurance.ts24:18: Argument of type 'TestResult[] | undefined' is not assignable to parameter of type 'SetStateAction<TestResult[]>'.
- TS2345 at src/hooks/useQualityAssurance.ts28:53: Argument of type 'TestResult[] | undefined' is not assignable to parameter of type 'TestResult[]'.
- TS2345 at src/hooks/useQualityAssurance.ts29:57: Argument of type 'TestResult[] | undefined' is not assignable to parameter of type 'TestResult[]'.
- TS2345 at src/hooks/useQualityAssurance.ts30:48: Argument of type 'TestResult[] | undefined' is not assignable to parameter of type 'TestResult[]'.
- TS2345 at src/hooks/useQualityAssurance.ts31:47: Argument of type 'TestResult[] | undefined' is not assignable to parameter of type 'TestResult[]'.
- TS7030 at src/hooks/useQualityAssurance.ts43:13: Not all code paths return a value.
- TS2345 at src/hooks/useQualityAssurance.ts170:47: Argument of type 'QualityMetrics | undefined' is not assignable to parameter of type 'QualityMetrics'.

### src/hooks/useMultiStore.ts (6)
- TS6133 at src/hooks/useMultiStore.ts3:8: 'React' is declared but its value is never read.
- TS6133 at src/hooks/useMultiStore.ts38:10: 'tableName' is declared but its value is never read.
- TS6133 at src/hooks/useMultiStore.ts39:14: 'columns' is declared but its value is never read.
- TS2532 at src/hooks/useMultiStore.ts189:9: Object is possibly 'undefined'.
- TS2532 at src/hooks/useMultiStore.ts190:9: Object is possibly 'undefined'.
- TS2532 at src/hooks/useMultiStore.ts191:9: Object is possibly 'undefined'.

### src/lib/rate-limiting/middleware.ts (6)
- TS6133 at src/lib/rate-limiting/middleware.ts95:21: 'request' is declared but its value is never read.
- TS6133 at src/lib/rate-limiting/middleware.ts143:21: 'request' is declared but its value is never read.
- TS6133 at src/lib/rate-limiting/middleware.ts168:21: 'request' is declared but its value is never read.
- TS2532 at src/lib/rate-limiting/middleware.ts251:12: Object is possibly 'undefined'.
- TS2339 at src/lib/rate-limiting/middleware.ts255:18: Property 'ip' does not exist on type 'NextRequest'.
- TS6133 at src/lib/rate-limiting/middleware.ts258:51: 'result' is declared but its value is never read.

### src/hooks/useAdminChat.ts (6)
- TS18048 at src/hooks/useAdminChat.ts117:17: 'payload.data' is possibly 'undefined'.
- TS18048 at src/hooks/useAdminChat.ts118:22: 'payload.data' is possibly 'undefined'.
- TS18048 at src/hooks/useAdminChat.ts120:24: 'payload.data' is possibly 'undefined'.
- TS18048 at src/hooks/useAdminChat.ts123:17: 'payload.data' is possibly 'undefined'.
- TS18048 at src/hooks/useAdminChat.ts124:22: 'payload.data' is possibly 'undefined'.
- TS18048 at src/hooks/useAdminChat.ts126:24: 'payload.data' is possibly 'undefined'.

### src/app/reservations/page.tsx (6)
- TS6133 at src/app/reservations/page.tsx7:1: 'Badge' is declared but its value is never read.
- TS6133 at src/app/reservations/page.tsx8:1: 'Card' is declared but its value is never read.
- TS6133 at src/app/reservations/page.tsx20:3: 'Filter' is declared but its value is never read.
- TS6133 at src/app/reservations/page.tsx23:3: 'RefreshCw' is declared but its value is never read.
- TS6133 at src/app/reservations/page.tsx200:22: 'setSlotHeight' is declared but its value is never read.
- TS2345 at src/app/reservations/page.tsx309:27: Argument of type 'number | undefined' is not assignable to parameter of type 'number'.

### src/app/reservations/register/page.tsx (6)
- TS18048 at src/app/reservations/register/page.tsx219:26: 'startH' is possibly 'undefined'.
- TS18048 at src/app/reservations/register/page.tsx219:40: 'startM' is possibly 'undefined'.
- TS18048 at src/app/reservations/register/page.tsx220:24: 'endH' is possibly 'undefined'.
- TS18048 at src/app/reservations/register/page.tsx220:36: 'endM' is possibly 'undefined'.
- TS2379 at src/app/reservations/register/page.tsx246:18: Argument of type '{ time: string; available: boolean; conflictReason: string | undefined; }' is not assignable to parameter of type 'TimeSlot' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2345 at src/app/reservations/register/page.tsx306:28: Argument of type 'number | undefined' is not assignable to parameter of type 'number'.

### src/components/ui/responsive-table.tsx (5)
- TS2322 at src/components/ui/responsive-table.tsx76:23: Type 'unknown' is not assignable to type 'ReactNode'.
- TS2322 at src/components/ui/responsive-table.tsx99:29: Type 'unknown' is not assignable to type 'ReactNode'.
- TS2322 at src/components/ui/responsive-table.tsx155:27: Type 'unknown' is not assignable to type 'ReactNode'.
- TS2322 at src/components/ui/responsive-table.tsx193:27: Type 'unknown' is not assignable to type 'ReactNode'.
- TS2322 at src/components/ui/responsive-table.tsx234:21: Type 'unknown' is not assignable to type 'ReactNode'.

### src/hooks/useSessionManagement.ts (5)
- TS6133 at src/hooks/useSessionManagement.ts14:3: 'getGeolocationFromIP' is declared but its value is never read.
- TS2345 at src/hooks/useSessionManagement.ts145:22: Argument of type '{ isAuthenticated: true; userId: any; clinicId: any; customSessionId: string | undefined; supabaseSession: any; }' is not assignable to parameter of type 'SetStateAction<SessionInfo>'.
- TS2379 at src/hooks/useSessionManagement.ts211:9: Argument of type '{ deviceInfo: DeviceInfo; ipAddress: string | undefined; userAgent: string; rememberDevice: false; }' is not assignable to parameter of type 'CreateSessionOptions' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS18048 at src/hooks/useSessionManagement.ts220:32: 'session' is possibly 'undefined'.
- TS18048 at src/hooks/useSessionManagement.ts223:14: 'session' is possibly 'undefined'.

### src/components/master/admin-master-form.tsx (5)
- TS6198 at src/components/master/admin-master-form.tsx30:58: All destructured elements are unused.
- TS6133 at src/components/master/admin-master-form.tsx48:26: 'setImpactedStores' is declared but its value is never read.
- TS6133 at src/components/master/admin-master-form.tsx49:25: 'setNeedsApproval' is declared but its value is never read.
- TS6133 at src/components/master/admin-master-form.tsx56:29: 'e' is declared but its value is never read.
- TS2322 at src/components/master/admin-master-form.tsx159:43: Type '{ children: Element; variant: "outline"; asChild: true; }' is not assignable to type 'IntrinsicAttributes & ButtonProps & RefAttributes<HTMLButtonElement>'.

### src/app/api/chat/route.ts (5)
- TS6133 at src/app/api/chat/route.ts4:1: 'generateAIComment' is declared but its value is never read.
- TS2769 at src/app/api/chat/route.ts106:10: No overload matches this call.
- TS2339 at src/app/api/chat/route.ts118:37: Property 'id' does not exist on type 'never'.
- TS2769 at src/app/api/chat/route.ts124:8: No overload matches this call.
- TS2769 at src/app/api/chat/route.ts158:8: No overload matches this call.

### src/hooks/queries/useSystemSettingsQuery.ts (4)
- TS2322 at src/hooks/queries/useSystemSettingsQuery.ts45:5: Type '{ items: MasterDataDetail[]; total: number; } | undefined' is not assignable to type '{ items: MasterDataDetail[]; total: number; }'.
- TS2322 at src/hooks/queries/useSystemSettingsQuery.ts68:5: Type 'MasterDataDetail | undefined' is not assignable to type 'MasterDataDetail'.
- TS2322 at src/hooks/queries/useSystemSettingsQuery.ts94:5: Type 'MasterDataDetail | undefined' is not assignable to type 'MasterDataDetail'.
- TS2345 at src/hooks/queries/useSystemSettingsQuery.ts131:45: Argument of type 'FilterState' is not assignable to parameter of type 'Record<string, unknown>'.

### src/hooks/useSystemSettingsV2.ts (4)
- TS2322 at src/hooks/useSystemSettingsV2.ts150:5: Type '() => void' is not assignable to type '(filters?: Partial<FilterState> | undefined) => Promise<void>'.
- TS2322 at src/hooks/useSystemSettingsV2.ts151:5: Type '(data: Partial<MasterDataDetail>) => Promise<Partial<MasterDataDetail>>' is not assignable to type '(data: Partial<MasterDataDetail>) => Promise<boolean>'.
- TS2322 at src/hooks/useSystemSettingsV2.ts152:5: Type '(id: string, updates: Partial<MasterDataDetail>) => Promise<void>' is not assignable to type '(id: string, data: Partial<MasterDataDetail>) => Promise<boolean>'.
- TS2322 at src/hooks/useSystemSettingsV2.ts153:5: Type '(id: string) => Promise<void>' is not assignable to type '(id: string) => Promise<boolean>'.

### src/components/dashboard/revenue-chart.tsx (4)
- TS7053 at src/components/dashboard/revenue-chart.tsx52:18: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ daily: { date: string; insurance: number; selfPay: number; }[]; weekly: { week: string; insurance: number; selfPay: number; }[]; monthly: { month: string; insurance: number; selfPay: number; }[]; }'.
- TS7053 at src/components/dashboard/revenue-chart.tsx53:26: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ daily: { date: string; insurance: number; selfPay: number; }[]; weekly: { week: string; insurance: number; selfPay: number; }[]; monthly: { month: string; insurance: number; selfPay: number; }[]; }'.
- TS7006 at src/components/dashboard/revenue-chart.tsx65:54: Parameter 'item' implicitly has an 'any' type.
- TS7006 at src/components/dashboard/revenue-chart.tsx69:54: Parameter 'item' implicitly has an 'any' type.

### src/app/api/patients/route.ts (4)
- TS6133 at src/app/api/patients/route.ts30:22: 'userAgent' is declared but its value is never read.
- TS2345 at src/app/api/patients/route.ts108:75: Argument of type '{ patient_uuid: string; }' is not assignable to parameter of type 'undefined'.
- TS2345 at src/app/api/patients/route.ts126:11: Argument of type '{ patient_uuid: string; }' is not assignable to parameter of type 'undefined'.
- TS2769 at src/app/api/patients/route.ts268:8: No overload matches this call.

### src/components/reservations/reservation-form.tsx (4)
- TS2345 at src/components/reservations/reservation-form.tsx95:26: Argument of type 'number | undefined' is not assignable to parameter of type 'number'.
- TS2375 at src/components/reservations/reservation-form.tsx141:14: Type '{ children: Element[]; value: string | undefined; onValueChange: Dispatch<SetStateAction<string | undefined>>; }' is not assignable to type '{ value?: string; defaultValue?: string; onValueChange?(value: string): void; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2375 at src/components/reservations/reservation-form.tsx165:14: Type '{ children: Element[]; value: string | undefined; onValueChange: Dispatch<SetStateAction<string | undefined>>; }' is not assignable to type '{ value?: string; defaultValue?: string; onValueChange?(value: string): void; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS2375 at src/components/reservations/reservation-form.tsx183:14: Type '{ children: Element[]; value: string | undefined; onValueChange: Dispatch<SetStateAction<string | undefined>>; }' is not assignable to type '{ value?: string; defaultValue?: string; onValueChange?(value: string): void; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.

### src/app/daily-reports/page.tsx (4)
- TS2339 at src/app/daily-reports/page.tsx66:49: Property 'reports' does not exist on type '{}'.
- TS2339 at src/app/daily-reports/page.tsx67:48: Property 'reports' does not exist on type '{}'.
- TS2339 at src/app/daily-reports/page.tsx78:33: Property 'summary' does not exist on type '{}'.
- TS2339 at src/app/daily-reports/page.tsx79:39: Property 'monthlyTrends' does not exist on type '{}'.

### src/lib/schemas/auth.ts (4)
- TS2345 at src/lib/schemas/auth.ts92:5: Argument of type 'ZodObject<{ email: ZodString; password: ZodString; }, "strip", ZodTypeAny, { email: string; password: string; }, { email: string; password: string; }>' is not assignable to parameter of type '$ZodType<any, { email: string; password: string; }, $ZodTypeInternals<any, { email: string; password: string; }>>'.
- TS2345 at src/lib/schemas/auth.ts108:5: Argument of type 'ZodObject<{ email: ZodString; password: ZodEffects<ZodString, string, string>; }, "strip", ZodTypeAny, { email: string; password: string; }, { ...; }>' is not assignable to parameter of type '$ZodType<any, { email: string; password: string; }, $ZodTypeInternals<any, { email: string; password: string; }>>'.
- TS2344 at src/lib/schemas/auth.ts176:42: Type 'ZodPipe<ZodPipe<ZodTransform<ZodObject<{ email: ZodPipe<ZodTransform<unknown, unknown>, ZodString>; password: ZodPipe<ZodTransform<unknown, unknown>, ZodString>; }, $strip>, FormData | ... 1 more ... | { ...; }>, ZodObject<...>>, $ZodType<...>>' does not satisfy the constraint 'ZodType<any, any, any>'.
- TS2344 at src/lib/schemas/auth.ts177:43: Type 'ZodPipe<ZodPipe<ZodTransform<ZodObject<{ email: ZodPipe<ZodTransform<unknown, unknown>, ZodString>; password: ZodPipe<ZodTransform<unknown, unknown>, ZodString>; }, $strip>, FormData | ... 1 more ... | { ...; }>, ZodObject<...>>, $ZodType<...>>' does not satisfy the constraint 'ZodType<any, any, any>'.

### src/components/admin/SecurityDashboard.tsx (4)
- TS6133 at src/components/admin/SecurityDashboard.tsx15:3: 'AlertTriangle' is declared but its value is never read.
- TS6133 at src/components/admin/SecurityDashboard.tsx18:3: 'TrendingUp' is declared but its value is never read.
- TS6133 at src/components/admin/SecurityDashboard.tsx22:3: 'Eye' is declared but its value is never read.
- TS6133 at src/components/admin/SecurityDashboard.tsx28:3: 'Database' is declared but its value is never read.

### src/app/api/admin/tables/route.ts (4)
- TS2769 at src/app/api/admin/tables/route.ts220:8: No overload matches this call.
- TS2339 at src/app/api/admin/tables/route.ts239:17: Property 'id' does not exist on type 'never'.
- TS2554 at src/app/api/admin/tables/route.ts295:7: Expected 2 arguments, but got 3.
- TS2345 at src/app/api/admin/tables/route.ts308:15: Argument of type '{ name: string; is_active: boolean; color_code: string; display_order: number; id?: string | undefined; created_at?: string | undefined; description?: string | undefined; icon_name?: string | undefined; updated_at?: string | undefined; } | { ...; } | { ...; } | { ...; } | { ...; }' is not assignable to parameter of type 'never'.

### src/app/api/admin/security/csp-violations/route.ts (4)
- TS6133 at src/app/api/admin/security/csp-violations/route.ts113:11: 'statsQuery' is declared but its value is never read.
- TS2339 at src/app/api/admin/security/csp-violations/route.ts121:17: Property 'severity' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/csp-violations/route.ts121:36: Property 'severity' does not exist on type 'never'.
- TS2345 at src/app/api/admin/security/csp-violations/route.ts203:15: Argument of type '{ is_false_positive: any; notes: any; reviewed_by: string; reviewed_at: string; updated_at: string; }' is not assignable to parameter of type 'never'.

### src/app/api/security/csp-report/route.ts (4)
- TS2769 at src/app/api/security/csp-report/route.ts128:8: No overload matches this call.
- TS2339 at src/app/api/security/csp-report/route.ts134:54: Property 'id' does not exist on type 'never'.
- TS2532 at src/app/api/security/csp-report/route.ts307:25: Object is possibly 'undefined'.
- TS2339 at src/app/api/security/csp-report/route.ts309:18: Property 'ip' does not exist on type 'NextRequest'.

### src/components/admin/staff-management-settings.tsx (4)
- TS6133 at src/components/admin/staff-management-settings.tsx16:3: 'Clock' is declared but its value is never read.
- TS6133 at src/components/admin/staff-management-settings.tsx67:17: 'setRoles' is declared but its value is never read.
- TS2345 at src/components/admin/staff-management-settings.tsx134:16: Argument of type '(prev: Staff[]) => (Staff | { id: string; name: string; email: string; role: "receptionist"; status: "pending"; joinDate: string | undefined; permissions: string[]; })[]' is not assignable to parameter of type 'SetStateAction<Staff[]>'.
- TS2345 at src/components/admin/staff-management-settings.tsx267:33: Argument of type '(prev: { name: string; email: string; role: "receptionist"; }) => { role: "admin" | "manager" | "therapist" | "receptionist"; name: string; email: string; }' is not assignable to parameter of type 'SetStateAction<{ name: string; email: string; role: "receptionist"; }>'.

### src/components/session/SessionManager.tsx (4)
- TS6133 at src/components/session/SessionManager.tsx19:3: 'MapPin' is declared but its value is never read.
- TS6133 at src/components/session/SessionManager.tsx23:3: 'X' is declared but its value is never read.
- TS2379 at src/components/session/SessionManager.tsx73:40: Argument of type '{ action: "revoke_all_other"; sessionId: string | undefined; }' is not assignable to parameter of type 'DeviceManagementAction' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS6133 at src/components/session/SessionManager.tsx95:9: 'getDeviceIcon' is declared but its value is never read.

### src/app/api/resources/route.ts (3)
- TS2769 at src/app/api/resources/route.ts74:75: No overload matches this call.
- TS2345 at src/app/api/resources/route.ts101:75: Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'never'.
- TS2345 at src/app/api/resources/route.ts125:69: Argument of type '{ is_deleted: boolean; }' is not assignable to parameter of type 'never'.

### src/lib/error-handler-enhanced.ts (3)
- TS6133 at src/lib/error-handler-enhanced.ts70:11: 'errorStack' is declared but its value is never read.
- TS2341 at src/lib/error-handler-enhanced.ts200:34: Property 'logSecurityEvent' is private and only accessible within class 'SecurityMonitor'.
- TS2561 at src/lib/error-handler-enhanced.ts201:9: Object literal may only specify known properties, but 'eventType' does not exist in type '{ user_id?: string; clinic_id?: string; session_id?: string; event_type: string; event_category: string; severity_level: string; event_description: string; event_data?: any; ip_address?: string; user_agent?: string; source_component: string; }'. Did you mean to write 'event_type'?

### src/app/api/mfa/setup/initiate/route.ts (3)
- TS2339 at src/app/api/mfa/setup/initiate/route.ts38:46: Property 'clinic_id' does not exist on type 'never'.
- TS2339 at src/app/api/mfa/setup/initiate/route.ts38:67: Property 'is_active' does not exist on type 'never'.
- TS2339 at src/app/api/mfa/setup/initiate/route.ts45:49: Property 'clinic_id' does not exist on type 'never'.

### src/lib/performance.ts (3)
- TS6133 at src/lib/performance.ts14:11: 'observer' is declared but its value is never read.
- TS18048 at src/lib/performance.ts181:44: 'measure' is possibly 'undefined'.
- TS18048 at src/lib/performance.ts184:14: 'measure' is possibly 'undefined'.

### src/components/mfa/MFADashboard.tsx (3)
- TS6133 at src/components/mfa/MFADashboard.tsx11:1: 'Switch' is declared but its value is never read.
- TS6133 at src/components/mfa/MFADashboard.tsx12:1: 'Separator' is declared but its value is never read.
- TS6133 at src/components/mfa/MFADashboard.tsx19:3: 'Download' is declared but its value is never read.

### src/app/master-data/page.tsx (3)
- TS2345 at src/app/master-data/page.tsx138:20: Argument of type 'string | undefined' is not assignable to parameter of type 'SetStateAction<string>'.
- TS2345 at src/app/master-data/page.tsx144:20: Argument of type 'string | undefined' is not assignable to parameter of type 'SetStateAction<string>'.
- TS6133 at src/app/master-data/page.tsx148:9: 'activeItems' is declared but its value is never read.

### src/lib/rate-limiting/csp-rate-limiter.ts (3)
- TS2322 at src/lib/rate-limiting/csp-rate-limiter.ts57:5: Type 'CSPRateLimitConfig | undefined' is not assignable to type 'CSPRateLimitConfig'.
- TS2571 at src/lib/rate-limiting/csp-rate-limiter.ts107:31: Object is of type 'unknown'.
- TS2322 at src/lib/rate-limiting/csp-rate-limiter.ts177:5: Type 'CSPRateLimitConfig | undefined' is not assignable to type 'CSPRateLimitConfig'.

### src/app/api/auth/profile/route.ts (3)
- TS2339 at src/app/api/auth/profile/route.ts77:33: Property 'role' does not exist on type 'never'.
- TS2339 at src/app/api/auth/profile/route.ts78:37: Property 'clinic_id' does not exist on type 'never'.
- TS2322 at src/app/api/auth/profile/route.ts84:7: Type 'string | undefined' is not assignable to type 'string | null'.

### src/components/admin/data-table.tsx (3)
- TS6133 at src/components/admin/data-table.tsx18:3: 'SelectItem' is declared but its value is never read.
- TS6133 at src/components/admin/data-table.tsx23:3: 'Plus' is declared but its value is never read.
- TS2322 at src/components/admin/data-table.tsx236:29: Type '{}' is not assignable to type 'ReactNode'.

### src/app/api/menus/route.ts (3)
- TS2769 at src/app/api/menus/route.ts82:71: No overload matches this call.
- TS2345 at src/app/api/menus/route.ts112:71: Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'never'.
- TS2345 at src/app/api/menus/route.ts136:65: Argument of type '{ is_deleted: boolean; }' is not assignable to parameter of type 'never'.

### src/app/staff/page.tsx (3)
- TS6133 at src/app/staff/page.tsx16:5: 'staffMetrics' is declared but its value is never read.
- TS6133 at src/app/staff/page.tsx18:5: 'satisfactionCorrelation' is declared but its value is never read.
- TS6133 at src/app/staff/page.tsx21:5: 'performanceTrends' is declared but its value is never read.

### src/app/api/customers/route.ts (2)
- TS2769 at src/app/api/customers/route.ts80:75: No overload matches this call.
- TS2345 at src/app/api/customers/route.ts109:75: Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'never'.

### src/lib/accessibility-test.ts (2)
- TS6133 at src/lib/accessibility-test.ts139:41: 'index' is declared but its value is never read.
- TS2532 at src/lib/accessibility-test.ts242:9: Object is possibly 'undefined'.

### src/hooks/useAdminMaster.ts (2)
- TS2379 at src/hooks/useAdminMaster.ts16:42: Argument of type '{ category: string | undefined; clinicId: string | undefined; }' is not assignable to parameter of type 'Partial<FilterState>' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
- TS6133 at src/hooks/useAdminMaster.ts22:5: 'limit' is declared but its value is never read.

### src/app/api/admin/security/csp-stats/route.ts (2)
- TS2339 at src/app/api/admin/security/csp-stats/route.ts68:50: Property 'client_ip' does not exist on type 'never'.
- TS2339 at src/app/api/admin/security/csp-stats/route.ts74:30: Property 'violated_directive' does not exist on type 'never'.

### src/components/admin/services-pricing-settings.tsx (2)
- TS6133 at src/components/admin/services-pricing-settings.tsx5:1: 'Input' is declared but its value is never read.
- TS6133 at src/components/admin/services-pricing-settings.tsx7:1: 'Label' is declared but its value is never read.

### src/components/admin/system-settings.tsx (2)
- TS6133 at src/components/admin/system-settings.tsx12:3: 'Key' is declared but its value is never read.
- TS6133 at src/components/admin/system-settings.tsx13:3: 'AlertTriangle' is declared but its value is never read.

### src/components/chat/chat-interface.tsx (2)
- TS2554 at src/components/chat/chat-interface.tsx11:48: Expected 1 arguments, but got 0.
- TS2339 at src/components/chat/chat-interface.tsx82:23: Property 'isUser' does not exist on type 'Message'.

### src/components/mfa/MFASetupWizard.tsx (2)
- TS6133 at src/components/mfa/MFASetupWizard.tsx8:27: 'useEffect' is declared but its value is never read.
- TS6133 at src/components/mfa/MFASetupWizard.tsx11:1: 'Card' is declared but its value is never read.

### src/components/ui/dropdown-menu.tsx (2)
- TS2769 at src/components/ui/dropdown-menu.tsx59:7: No overload matches this call.
- TS18046 at src/components/ui/dropdown-menu.tsx62:9: 'children.props' is of type 'unknown'.

### src/components/ui/alert-dialog.tsx (2)
- TS2769 at src/components/ui/alert-dialog.tsx60:7: No overload matches this call.
- TS18046 at src/components/ui/alert-dialog.tsx63:9: 'children.props' is of type 'unknown'.

### src/app/dashboard/page.tsx (2)
- TS6133 at src/app/dashboard/page.tsx20:3: 'ResponsiveLayout' is declared but its value is never read.
- TS6133 at src/app/dashboard/page.tsx21:3: 'ResponsiveSection' is declared but its value is never read.

### src/components/admin/improved-table-editor.tsx (1)
- TS6133 at src/components/admin/improved-table-editor.tsx29:5: 'filterState' is declared but its value is never read.

### src/app/reservations/list/page.tsx (1)
- TS6133 at src/app/reservations/list/page.tsx11:1: 'Table' is declared but its value is never read.

### src/components/admin/table-editor.tsx (1)
- TS2375 at src/components/admin/table-editor.tsx16:11: Type '{ onTableChange: ((tableName: string) => void) | undefined; }' is not assignable to type 'ImprovedTableEditorProps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.

### src/components/patients/conversion-funnel.tsx (1)
- TS2532 at src/components/patients/conversion-funnel.tsx27:27: Object is possibly 'undefined'.

### src/components/session/SessionTimeoutDialog.tsx (1)
- TS2322 at src/components/session/SessionTimeoutDialog.tsx98:33: Type '{ children: Element; asChild: true; }' is not assignable to type 'IntrinsicAttributes & HTMLAttributes<HTMLParagraphElement> & RefAttributes<HTMLParagraphElement>'.

### src/app/api/mfa/backup-codes/usage/route.ts (1)
- TS6133 at src/app/api/mfa/backup-codes/usage/route.ts10:27: 'request' is declared but its value is never read.

### src/app/api/mfa/disable/route.ts (1)
- TS6133 at src/app/api/mfa/disable/route.ts30:11: 'reason' is declared but its value is never read.

### src/components/staff/shift-optimizer.tsx (1)
- TS2345 at src/components/staff/shift-optimizer.tsx144:40: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.

### src/lib/error-handler.ts (1)
- TS2322 at src/lib/error-handler.ts98:5: Type 'string | undefined' is not assignable to type 'string'.

### src/lib/audit-logger.ts (1)
- TS2769 at src/lib/audit-logger.ts56:59: No overload matches this call.

### src/lib/api/admin/master-data-client.ts (1)
- TS2352 at src/lib/api/admin/master-data-client.ts51:8: Conversion of type 'ApiResponse<T>' to type '{ error?: string; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.

### src/lib/api/admin/dashboard-client.ts (1)
- TS2352 at src/lib/api/admin/dashboard-client.ts44:8: Conversion of type 'ApiResponse<AdminDashboardPayload>' to type '{ error?: string; }' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.

### src/components/ui/alert.tsx (1)
- TS7030 at src/components/ui/alert.tsx84:21: Not all code paths return a value.

### src/hooks/useStaffAnalysis.ts (1)
- TS6133 at src/hooks/useStaffAnalysis.ts53:16: 'setData' is declared but its value is never read.

### src/app/api/mfa/status/route.ts (1)
- TS6133 at src/app/api/mfa/status/route.ts10:27: 'request' is declared but its value is never read.

### src/app/api/mfa/verify/route.ts (1)
- TS2769 at src/app/api/mfa/verify/route.ts14:36: No overload matches this call.

### src/components/ui/form-field.tsx (1)
- TS2769 at src/components/ui/form-field.tsx52:15: No overload matches this call.

### src/hooks/useMasterData.ts (1)
- TS2379 at src/hooks/useMasterData.ts56:22: Argument of type '{ clinic_id: string | undefined; category: string | undefined; }' is not assignable to parameter of type '{ category?: string; clinic_id?: string | null; is_public?: boolean; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.

### src/hooks/useDailyReports.ts (1)
- TS2698 at src/hooks/useDailyReports.ts113:43: Spread types may only be created from object types.

### src/components/ui/medical-banner.tsx (1)
- TS6133 at src/components/ui/medical-banner.tsx11:3: 'Heart' is declared but its value is never read.

### src/components/admin/booking-calendar-settings.tsx (1)
- TS6133 at src/components/admin/booking-calendar-settings.tsx8:33: 'Users' is declared but its value is never read.

### src/lib/integration-tests.ts (1)
- TS2306 at src/lib/integration-tests.ts3:29: File 'C:/Users/seekf/Desktop/seikotsuin_management_saas/src/__tests__/e2e/dashboard.test.ts' is not a module.

### src/components/ui/medical-icons.tsx (1)
- TS2375 at src/components/ui/medical-icons.tsx300:20: Type '{ name: "medical-heart" | "medical-activity" | "medical-stethoscope" | "medical-pill" | "medical-temperature" | "status-emergency" | "status-warning" | "status-error" | "status-success" | ... 33 more ... | "trend-down"; variant: "default" | ... 5 more ... | undefined; size: "lg"; }' is not assignable to type 'MedicalIconProps' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.

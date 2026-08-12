import { readFileSync } from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260811155532_crm_line_growth_foundation.sql'
);
const rollbackPath = path.resolve(
  process.cwd(),
  'supabase/rollbacks/20260811155532_crm_line_growth_foundation_rollback.sql'
);

describe('CRM LINE growth migration contract', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const rollback = readFileSync(rollbackPath, 'utf8');

  it('uses the current customers/resources/reservations identity model', () => {
    expect(migration).toContain('customer_id uuid not null');
    expect(migration).toContain('foreign key (customer_id, clinic_id)');
    expect(migration).toContain('foreign key (staff_id, clinic_id)');
    expect(migration).toContain('foreign key (reservation_id, clinic_id)');
    expect(migration).toContain('staff_availability_events_id_clinic_unique');
    expect(migration).not.toContain(
      'create table if not exists public.patient_profiles'
    );
  });

  it('creates every required feature table with tenant-bound references', () => {
    for (const tableName of [
      'patient_identity_aliases',
      'patient_staff_preferences',
      'staff_availability_events',
      'staff_availability_notifications',
      'reservation_rewards',
    ]) {
      expect(migration).toContain(
        `create table if not exists public.${tableName}`
      );
    }
    expect(migration).toContain(
      "execute format('alter table public.%I enable row level security', table_name)"
    );
    expect(migration).toContain(
      "execute format('revoke all on table public.%I from anon', table_name)"
    );
    expect(migration).toContain(
      "execute format('revoke all on table public.%I from authenticated', table_name)"
    );
    expect(migration).toContain('foreign key (line_outbox_id, clinic_id)');
  });

  it('uses service-role-only SECURITY INVOKER RPCs for atomic state changes', () => {
    for (const functionName of [
      'create_staff_availability_event',
      'create_staff_availability_reservation',
      'finalize_staff_availability_delivery',
    ]) {
      expect(migration).toContain(
        `create or replace function public.${functionName}`
      );
      expect(migration).toContain(
        `grant execute on function public.${functionName}`
      );
    }
    expect(migration.match(/security invoker/giu)).toHaveLength(3);
    expect(migration).toContain('for update;');
    expect(migration).toContain(
      "locked_event.status not in ('open', 'notified')"
    );
    expect(migration).toContain(
      'locked_event.available_datetime <> p_start_time'
    );
    expect(migration).toContain("status = 'booked'");
    expect(migration).toContain("'source', 'staff_availability_event'");
  });

  it('validates staff, JST horizon, relationship history and current LINE ID before writes', () => {
    expect(migration).toContain("resource.type = 'staff'");
    expect(migration).toContain('resource.is_bookable = true');
    expect(migration).toContain("at time zone 'Asia/Tokyo'");
    expect(migration).toContain(
      "reservation.status in ('completed', 'arrived')"
    );
    expect(migration).toContain('customer.line_user_id = v_line_user_id');
    expect(
      migration.indexOf('STAFF_AVAILABILITY_STAFF_NOT_FOUND')
    ).toBeLessThan(
      migration.indexOf('insert into public.staff_availability_events')
    );
  });

  it('has a matching non-destructive rollback', () => {
    for (const tableName of [
      'reservation_rewards',
      'staff_availability_notifications',
      'staff_availability_events',
      'patient_staff_preferences',
      'patient_identity_aliases',
    ]) {
      expect(rollback).toContain(`drop table if exists public.${tableName}`);
    }
    expect(rollback).not.toMatch(
      /delete from|truncate|drop table public\.customers/iu
    );
    expect(
      rollback.indexOf(
        'drop function if exists public.create_staff_availability_reservation'
      )
    ).toBeLessThan(
      rollback.indexOf('drop table if exists public.staff_availability_events')
    );
  });
});

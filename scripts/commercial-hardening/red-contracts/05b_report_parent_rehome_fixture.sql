do $commercial_red$
declare
  rejected_constraint text;
begin
  begin
    insert into public.clinics (id, name)
    values
      ('f6000000-0000-4000-8000-000000000001', 'commercial-pr06-red-clinic-a'),
      ('f6000000-0000-4000-8000-000000000002', 'commercial-pr06-red-clinic-b');

    insert into public.daily_reports (id, clinic_id, report_date)
    values (
      'f6000000-0000-4000-8000-000000000010',
      'f6000000-0000-4000-8000-000000000001',
      '2096-06-01'
    );

    insert into public.daily_report_items (
      id,
      clinic_id,
      daily_report_id,
      report_date,
      patient_name,
      treatment_name
    )
    values (
      'f6000000-0000-4000-8000-000000000011',
      'f6000000-0000-4000-8000-000000000001',
      'f6000000-0000-4000-8000-000000000010',
      '2096-06-01',
      'commercial-pr06-red-patient',
      'commercial-pr06-red-treatment'
    );

    begin
      update public.daily_reports
      set clinic_id = 'f6000000-0000-4000-8000-000000000002'
      where id = 'f6000000-0000-4000-8000-000000000010';
    exception
      when foreign_key_violation then
        get stacked diagnostics rejected_constraint = constraint_name;

        if rejected_constraint <> 'daily_report_items_daily_report_id_fkey' then
          raise exception
            'COMM-FK-005 contract error: unexpected rejecting constraint %',
            rejected_constraint;
        end if;

        raise exception 'COMM-FK-005 fixture rollback'
          using errcode = 'CF005';
    end;

    raise exception 'RED COMM-FK-005: daily report parent clinic rehome was allowed';
  exception
    when sqlstate 'CF005' then
      return;
  end;
end
$commercial_red$;

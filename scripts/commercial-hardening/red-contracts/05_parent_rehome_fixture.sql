do $commercial_red$
begin
  insert into public.clinics (id, name)
  values
    ('f0000000-0000-4000-8000-000000000001', 'commercial-red-clinic-a'),
    ('f0000000-0000-4000-8000-000000000002', 'commercial-red-clinic-b');

  insert into public.customers (id, clinic_id, name, phone)
  values (
    'f0000000-0000-4000-8000-000000000011',
    'f0000000-0000-4000-8000-000000000001',
    'commercial-red-customer',
    '09000000001'
  );

  insert into public.menus (
    id,
    clinic_id,
    name,
    price,
    duration_minutes
  )
  values (
    'f0000000-0000-4000-8000-000000000012',
    'f0000000-0000-4000-8000-000000000001',
    'commercial-red-menu',
    1000,
    30
  );

  insert into public.resources (id, clinic_id, name, type)
  values (
    'f0000000-0000-4000-8000-000000000013',
    'f0000000-0000-4000-8000-000000000001',
    'commercial-red-resource',
    'staff'
  );

  insert into public.reservations (
    id,
    clinic_id,
    customer_id,
    menu_id,
    staff_id,
    start_time,
    end_time
  )
  values (
    'f0000000-0000-4000-8000-000000000014',
    'f0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000011',
    'f0000000-0000-4000-8000-000000000012',
    'f0000000-0000-4000-8000-000000000013',
    '2099-01-01T09:00:00+09:00',
    '2099-01-01T09:30:00+09:00'
  );

  begin
    update public.customers
    set clinic_id = 'f0000000-0000-4000-8000-000000000002'
    where id = 'f0000000-0000-4000-8000-000000000011';
  exception
    when foreign_key_violation or check_violation then
      raise exception 'GREEN COMM-FK-002: parent clinic rehome was rejected';
  end;

  raise exception 'RED COMM-FK-002: parent clinic rehome was allowed';
end
$commercial_red$;

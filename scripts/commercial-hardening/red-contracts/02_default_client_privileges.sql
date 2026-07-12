do $commercial_red$
declare
  unsafe_defaults text;
begin
  with public_object_owners as (
    select distinct c.relowner as owner_oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.refclassid = 'pg_extension'::regclass
          and d.deptype = 'e'
      )

    union

    select distinct p.proowner
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.refclassid = 'pg_extension'::regclass
          and d.deptype = 'e'
      )
  ),
  effective_global_function_defaults as (
    select
      owner_role.rolname as owner,
      '*'::text as schema,
      'f'::text as object_type,
      case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end as grantee,
      acl.privilege_type
    from public_object_owners object_owner
    join pg_roles owner_role on owner_role.oid = object_owner.owner_oid
    left join pg_default_acl d
      on d.defaclrole = object_owner.owner_oid
     and d.defaclnamespace = 0
     and d.defaclobjtype = 'f'
    cross join lateral aclexplode(
      coalesce(d.defaclacl, acldefault('f', object_owner.owner_oid))
    ) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
  ),
  explicit_defaults as (
    select
      owner_role.rolname as owner,
      coalesce(n.nspname, '*') as schema,
      d.defaclobjtype::text as object_type,
      case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end as grantee,
      acl.privilege_type
    from public_object_owners object_owner
    join pg_default_acl d on d.defaclrole = object_owner.owner_oid
    left join pg_namespace n on n.oid = d.defaclnamespace
    join pg_roles owner_role on owner_role.oid = d.defaclrole
    cross join lateral aclexplode(d.defaclacl) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'public' or d.defaclnamespace = 0
  ),
  unsafe as (
    select *
    from effective_global_function_defaults
    where grantee in ('PUBLIC', 'anon', 'authenticated')

    union

    select *
    from explicit_defaults
    where grantee in ('PUBLIC', 'anon', 'authenticated')
  )
  select string_agg(
    format(
      'owner=%s schema=%s object=%s grantee=%s privilege=%s',
      owner,
      schema,
      object_type,
      grantee,
      privilege_type
    ),
    '; ' order by owner, schema, object_type, grantee, privilege_type
  )
  into unsafe_defaults
  from unsafe;

  if unsafe_defaults is not null then
    raise exception 'RED COMM-GRANT-001: unsafe public default privileges: %', unsafe_defaults;
  end if;
end
$commercial_red$;

"""Issue 145. Synthetic data only in the dedicated loopback Supabase project."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import shutil
import time
import uuid

HERE = Path(__file__).resolve().parent
SOURCE = Path(os.environ["GITHUB_WORKSPACE"]).resolve()
CLI = Path(shutil.which("supabase") or "supabase")
PROJECT = "os145rehearsal261126a"
NET = PROJECT + "_net"
VERSION = "20260906003219"
SHA = "04cd5827c9062fbbcd04343f15a63449cbc04a2e"
FILE = VERSION + "_post_core100_notification_durability.sql"
TARGET = SOURCE / "supabase/migrations" / FILE
ROLLBACK = SOURCE / "supabase/rollbacks" / FILE.replace(".sql", "_rollback.sql")
TAP = HERE / "supabase/tests" / FILE.replace(".sql", "_test.sql")
LEDGER = HERE / "results.json"
STATE = json.loads(LEDGER.read_text(encoding="utf-8")) if LEDGER.exists() else {}
A = "e1450000-0000-4000-8000-000000000001"
C = "e1450000-0000-4000-8000-000000000011"
C_OTHER = "e1450000-0000-4000-8000-000000000012"
R = "e1450000-0000-4000-8000-000000000041"
G = "e1450000-0000-4000-8000-000000000051"
SERVICE = """SET LOCAL ROLE service_role; SET LOCAL request.jwt.claims = '{"role":"service_role"}';"""
ENV = {key: os.environ[key] for key in ("PATH","HOME","USER","LOGNAME","TMPDIR","LANG","LC_ALL","SSL_CERT_FILE") if key in os.environ}
ENV.update(PGPASSWORD="postgres", PGCONNECT_TIMEOUT="5", PGCLIENTENCODING="UTF8", DO_NOT_TRACK="1",
           SUPABASE_TELEMETRY_DISABLED="1")
PSQL = ["psql", "-X", "-w", "-qAt", "-h", "127.0.0.1", "-p", "57432", "-d", "postgres",
        "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]
VERSIONS = sorted(p.name.split("_")[0] for p in (SOURCE / "supabase/migrations").glob("*.sql"))
def check(condition, message):
    if not condition:
        raise RuntimeError(message)
def short(text):
    return "\n".join(line[:280] for line in text.splitlines() if not re.search(
        r"postgres(?:ql)?://|eyJ[A-Z]|api.?key|password|access.?token|secret.{0,10}=", line, re.I))[-2200:]
def call(args, *, input=None, env=None, timeout=30):
    return subprocess.run(args, cwd=HERE, env=ENV | (env or {}), input=input, capture_output=True,
                          encoding="utf-8", errors="replace", timeout=timeout, creationflags=0)
def ok(out, label):
    check(out.returncode == 0, label + ": " + short(out.stderr + out.stdout))
    return out.stdout.strip()
def sql(query, app="os145_observer", opts=None, timeout=15):
    return call(PSQL, input=query, env={"PGAPPNAME": app, "PGOPTIONS": opts or "-c statement_timeout=10000"}, timeout=timeout)
def scalar(query):
    return ok(sql(query), "observer query")
def jsql(query):
    return json.loads(scalar(query))
def cli(*args, env=None, timeout=200):
    return call([str(CLI), *args, "--workdir", str(HERE), "--network-id", NET], env=env, timeout=timeout)
def save():
    tmp = LEDGER.with_suffix(".new")
    tmp.write_text(json.dumps(STATE, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(LEDGER)
def now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
def guard():
    conf = (HERE / "supabase/config.toml").read_text(encoding="utf-8")
    check(f'project_id = "{PROJECT}"' in conf and re.search(r"(?m)^port = 57432$", conf), "unexpected config")
    check(not (HERE / "supabase/.temp/project-ref").exists(), "linked project refused")
    check(len(VERSIONS) == len(set(VERSIONS)) == 70, "wrong source version set")
    blob = ok(call(["git", "-C", str(SOURCE), "rev-parse", SHA + ":supabase/migrations/" + FILE]), "git blob")
    work_blob = ok(call(["git", "-C", str(SOURCE), "hash-object", "supabase/migrations/" + FILE]), "git worktree hash")
    check(blob == work_blob == "5e348a5aa0dd6dc7acd71704c61db02338a44465", "migration source mismatch")
    meta = json.loads(ok(call(["docker","--context","default","inspect","--format",
                           '{{json .NetworkSettings}}',"supabase_db_"+PROJECT],timeout=60), "inspect dedicated container"))
    bindings = meta["Ports"].get("5432/tcp") or []
    check(bindings == [{"HostIp":"127.0.0.1","HostPort":"57432"}], "unexpected host port binding: " + str(bindings))
    check(list(meta["Networks"]) == [NET], "unexpected Docker network")
    internal = ok(call(["docker", "--context", "default", "network", "inspect", NET, "--format", "{{.Internal}}"], timeout=60), "inspect test network")
    check(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("GITHUB_REF") == "refs/heads/codex/issue145-isolated-evidence-20261126", "expected isolated Actions branch")
    check(internal == "false", "unexpected rehearsal bridge mode")
    subnet = "198.18.145.0/28"
    for chain, extra in (("FORWARD", ["!", "-d", subnet]), ("INPUT", [])):
        ok(call(["sudo","-n","iptables","-C",chain,"-s",subnet,*extra,"-m","conntrack","--ctstate","NEW","-j","REJECT"]), "Docker subnet egress rule")
    check(scalar("select current_database() || '/' || inet_server_port()::text;") == "postgres/5432","wrong database")
def get_versions():
    return jsql("select json_agg(version order by version) from supabase_migrations.schema_migrations;")
def catalog():
    return jsql((HERE/"catalog.sql").read_text(encoding="utf-8"))
def expect_before(data):
    check(data["target_trigger"] is None and data["handoff"] is None and data["lease_index"] is None, "unexpected existing target objects")
    check(data["mail_revision"]["definer"] and "now()" in data["mail_revision"]["body"] and
          data["mail_revision"]["config"] == ["search_path=public, auth, extensions"], "old revision definition mismatch")
    check(data["old_triggers"], "existing timestamp triggers absent")
def pending(kind, options, *, customer=C):
    template = "reservation_confirmed" if kind == "confirmed" else "reservation_created"
    if options == "email":
        detail = (f"jsonb_build_object('version',1,'customer_id','{customer}','template_type','{template}',"
                  f"'to_email','fixture@example.invalid','dedupe_key','os145/{kind}','resend_idempotency_key','os145-key/{kind}',"
                  "'payload',jsonb_build_object('test',true))")
    else:
        detail = (f"jsonb_build_object('version',1,'customer_id','{customer}','line_user_id','U-r145-synthetic',"
                  "'dedupe_timestamp','2030-01-01T00:00:00Z','payload',jsonb_build_object('test',true))")
    return (f"insert into public.reservation_notifications (clinic_id,reservation_id,notification_type,channel,detail) "
            f"values ('{A}','{R}','{kind}','{options}', jsonb_build_object('enqueue',{detail})) "
            "on conflict (reservation_id,notification_type) do nothing returning id")
def legacy():
    return jsql(f"""select jsonb_build_object('status',status,'has_intent',detail ? 'enqueue','outbox_id_null',email_outbox_id is null,
    'outbox_count',(select count(*) from public.email_outbox where dedupe_key='os145/received'))
    from public.reservation_notifications where clinic_id='{A}' and reservation_id='{R}' and notification_type='received';""")
def baseline():
    vs = get_versions()
    check(vs == [v for v in VERSIONS if v != VERSION], "69-version baseline differs")
    before = catalog()
    expect_before(before)
    stats = scalar("select (select count(*) from public.reservation_notifications) || '/' || (select count(*) from public.email_outbox);")
    check(stats == "0/0", "baseline should have no operational rows")
    contents = TAP.read_text(encoding="utf-8")
    fixtures = contents[contents.index("insert into public.clinics"):contents.index("create temporary table pd_intent")]
    fixtures = fixtures.replace("d6060000", "e1450000").replace("__pd_", "__r145_").replace("U-pd-synthetic","U-r145-synthetic")
    fixtures = fixtures.replace("09000006061","09000001451").replace("09000006062","09000001452")
    load = f"""insert into public.email_outbox(clinic_id,reservation_id,customer_id,template_type,dedupe_key,resend_idempotency_key,
    to_email,payload,status) select '{A}','{R}','{C}','reservation_created','os145/load/'||g,'os145-key/load/'||g,
    'fixture@example.invalid','{{}}',case when g%10=0 then 'processing' else 'sent' end from generate_series(1,10000) g;"""
    ok(sql("begin;\n"+fixtures+"\n"+load+"\n"+SERVICE+"\n"+pending("received","email")+";\ncommit;",timeout=45), "synthetic fixtures")
    before_rows = jsql("select jsonb_build_object('email_rows',count(*),'processing',count(*) filter(where status='processing')) from public.email_outbox;")
    check(before_rows == {"email_rows":10000,"processing":1000}, "synthetic workload count mismatch")
    original_claim = legacy()
    check(original_claim == {"status":"claimed", "has_intent":True, "outbox_id_null":True, "outbox_count":0}, "old schema did not leave pending intent unconfirmed")
    STATE.update(source=SHA, migration_blob="5e348a5aa0dd6dc7acd71704c61db02338a44465", when_start=now(),
                 engine=scalar("show server_version;"), environment={"loopback_port":57432,"dedicated_github_hosted_runner":True,"subnet_new_egress_rejected":True,
                 "project":PROJECT,"supabase_cli":"2.109.0","seed":False},
                 baseline={"versions":len(vs),"later":[v for v in vs if v>VERSION],
                 "version_digest":hashlib.sha256("\n".join(vs).encode()).hexdigest(),"catalog":before,
                 "synthetic_workload":before_rows,"legacy_claim":original_claim})
    save()
    print("baseline verified",before_rows)
def dryrun():
    dest = HERE/"supabase/migrations"/FILE
    if not dest.exists():
        dest.write_bytes(TARGET.read_bytes())
    check(dest.read_bytes()==TARGET.read_bytes(), "staged SQL differs")
    blocked = cli("db","push","--local","--dry-run")
    allowed = cli("db","push","--local","--include-all","--dry-run")
    plan = allowed.stdout + allowed.stderr
    ok(allowed,"dry-run with include-all")
    planned_files = sorted(set(re.findall(r"\b(\d{14}_[A-Za-z0-9_]+\.sql)\b",plan)))
    check(planned_files==[FILE],"unexpected dry run: "+short(plan))
    check(get_versions()==[v for v in VERSIONS if v!=VERSION],"dry-run changed history")
    STATE["dry_run"] = {"without_include_all_exit":blocked.returncode,"without_include_all":short(blocked.stdout+blocked.stderr),
                        "with_include_all_exit":allowed.returncode,"planned":planned_files}
    save()
    print("dry run:",planned_files)
def start_psql(app,opts="-c statement_timeout=40000"):
    return subprocess.Popen(PSQL,cwd=HERE,env=ENV|{"PGAPPNAME":app,"PGOPTIONS":opts},stdin=subprocess.PIPE,
              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8",errors="replace",
              creationflags=0)
def send(p,q):
    p.stdin.write(q+"\n"); p.stdin.flush()
def finish(p, q=None, timeout=40):
    out, err = p.communicate(input=q,timeout=timeout)
    return subprocess.CompletedProcess(p.args,p.returncode,out,err)
def stop(p):
    if p.poll() is None:
        try: finish(p,"ROLLBACK;\n",timeout=5)
        except (BrokenPipeError,subprocess.TimeoutExpired,ValueError):
            p.terminate(); p.wait(timeout=5)
def wait_sql(query, test, label, timeout=10):
    deadline = time.monotonic()+timeout
    last = ""
    while time.monotonic()<deadline:
        last=scalar(query)
        if test(last): return last
        time.sleep(.10)
    raise RuntimeError(label+" not observed: "+last)
def migration_locks():
    return """select coalesce(json_agg(jsonb_build_object('table',c.relname,'mode',l.mode,'granted',l.granted)
    order by c.relname,l.mode),'[]') from pg_locks l join pg_stat_activity a on a.pid=l.pid
    join pg_class c on l.relation=c.oid where a.application_name='os145_blocked_apply'
    and c.oid in ('public.email_outbox'::regclass,'public.reservation_notifications'::regclass);"""
def locks():
    holder=start_psql("os145_holder")
    migrator=None
    try:
        send(holder,f"begin; update public.reservation_notifications set status=status where reservation_id='{R}' and notification_type='received';")
        wait_sql("select count(*) from pg_stat_activity a join pg_locks l using(pid) where a.application_name='os145_holder' and l.relation='public.reservation_notifications'::regclass and mode='RowExclusiveLock' and granted;",lambda v:v=="1","held ledger lock")
        migrator=start_psql("os145_blocked_apply","-c lock_timeout=12000 -c statement_timeout=20000")
        t0=time.monotonic()
        send(migrator,TARGET.read_text(encoding="utf-8"))
        snap=json.loads(wait_sql(migration_locks(),lambda v:any(not row["granted"] for row in json.loads(v)),"blocked DDL"))
        check(any(i=={"table":"email_outbox","mode":"ShareLock","granted":True} for i in snap), "email ShareLock absent")
        check(any(i=={"table":"reservation_notifications","mode":"ShareRowExclusiveLock","granted":False} for i in snap), "ledger trigger lock absent")
        chain=scalar("select a.pid=any(pg_blocking_pids(b.pid)) from pg_stat_activity a,pg_stat_activity b where a.application_name='os145_holder' and b.application_name='os145_blocked_apply';")
        check(chain=="t","wrong DDL blocker")
        t=time.monotonic()
        reads=sql("select (select count(*) from public.email_outbox), (select count(*) from public.reservation_notifications);",
                 "os145_reader","-c statement_timeout=1500")
        check(ok(reads,"reader")=="10000|1","unexpected read results")
        read_ms=round((time.monotonic()-t)*1000)
        writers={}
        for key,statement in (("email","update public.email_outbox set last_error='os145 lock probe' where dedupe_key='os145/load/1';"),
                               ("ledger",f"update public.reservation_notifications set status=status where reservation_id='{R}' and notification_type='received' and false;")):
            probe=start_psql("os145_writer_"+key,"-c lock_timeout=1600 -c statement_timeout=4000")
            try:
                t=time.monotonic(); send(probe,statement)
                edge=wait_sql("select exists(select from pg_stat_activity w,pg_stat_activity m where w.application_name='os145_writer_"+key+
                     "' and m.application_name='os145_blocked_apply' and m.pid=any(pg_blocking_pids(w.pid)));",lambda x:x=="t","writer waits behind DDL",timeout=1.25)
                pout=finish(probe,timeout=5)
                check(pout.returncode!=0 and "55P03" in pout.stderr,"writer did not hit lock_timeout: "+short(pout.stderr))
                writers[key]={"sqlstate":"55P03","timeout_ms":1600,"wall_ms":round((time.monotonic()-t)*1000),"blocked_by_migration":edge=="t"}
            finally: stop(probe)
        mout=finish(migrator,timeout=20)
        wall=round((time.monotonic()-t0)*1000)
        check(mout.returncode!=0 and "55P03" in mout.stderr,"migration did not time out: "+short(mout.stderr))
    finally:
        stop(holder)
        if migrator: stop(migrator)
    check(catalog()==STATE["baseline"]["catalog"],"catalog was not restored after failed migration")
    check(get_versions()==[v for v in VERSIONS if v!=VERSION],"history after failure mismatch")
    check(legacy()==STATE["baseline"]["legacy_claim"],"legacy row changed during failed trial")
    check(scalar("select count(*) from public.email_outbox where last_error='os145 lock probe';")=="0","probe wrote data")
    STATE["lock_trial"]={"method":"psql canonical SQL; natural transaction rollback on ON_ERROR_STOP/session close",
       "locks":snap,"migration_blocked_by_ledger_writer":True,"ddl_sqlstate":"55P03","ddl_lock_timeout_ms":12000,
       "ddl_wall_ms":wall,"reader_wall_ms":read_ms,"read_email_rows":10000,"read_ledger_rows":1,"writers":writers,
       "after_failure":{"baseline_catalog_equal":True,"history_count":69,"legacy_claim_equal":True,"probe_writes":0}}
    save()
    print("locking and failed-transaction recovery verified")
def interrupted_cli():
    check(get_versions()==[v for v in VERSIONS if v!=VERSION] and catalog()==STATE["baseline"]["catalog"],"prestate required")
    holder=start_psql("os145_cli_holder")
    process=None
    marker="os145_cli_"+uuid.uuid4().hex[:20]
    dsn=("postgresql://postgres@127.0.0.1:57432/postgres?sslmode=disable&application_name="+marker+
         "&options=-c%20lock_timeout%3D14000%20-c%20statement_timeout%3D25000")
    requested_cancel=False
    try:
        send(holder,f"begin; update public.reservation_notifications set status=status where reservation_id='{R}' and notification_type='received';")
        wait_sql("select count(*) from pg_stat_activity a join pg_locks l using(pid) where a.application_name='os145_cli_holder' and l.relation='public.reservation_notifications'::regclass and mode='RowExclusiveLock' and granted;",lambda n:n=="1","CLI test blocker")
        process=subprocess.Popen([str(CLI),"db","push","--db-url",dsn,"--include-all","--yes","--workdir",str(HERE),"--network-id",NET],
            cwd=HERE,env=ENV|{"PGAPPNAME":marker},
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding="utf-8",errors="replace",creationflags=0)
        held=f"""from pg_locks l join pg_stat_activity m on m.pid=l.pid
          join pg_stat_activity h on h.application_name='os145_cli_holder' and h.pid=any(pg_blocking_pids(m.pid))
          where l.relation='public.reservation_notifications'::regclass and l.mode='ShareRowExclusiveLock' and not l.granted
          and m.datname=current_database() and h.datname=m.datname and m.application_name='{marker}'
          and m.query ~* 'create[[:space:]]+trigger[[:space:]]+reservation_notification_durable_enqueue'
          and m.query ~* 'on[[:space:]]+public[.]reservation_notifications'"""
        deadline=time.monotonic()+48
        while time.monotonic()<deadline and process.poll() is None:
            matches=jsql("select coalesce(json_agg(json_build_array(m.pid,(extract(epoch from m.backend_start)*1000000)::bigint)),'[]') "+held+";")
            check(len(matches)<=1,"ambiguous test migration session")
            if matches and process.poll() is None:
                pid,started=matches[0]
                check(type(pid) is int and type(started) is int,"invalid target identity")
                confirmed=scalar("select pg_cancel_backend(m.pid) "+held+
                    f" and m.pid={pid} and (extract(epoch from m.backend_start)*1000000)::bigint={started};")
                requested_cancel=confirmed=="t"
                break
            time.sleep(.10)
        stdout,err=process.communicate(timeout=35)
        message=stdout+err
        canceled="57014" in message or "canceling statement due to user request" in message.lower()
        timed_out="55P03" in message or "lock timeout" in message.lower()
        check(process.returncode!=0 and ((requested_cancel and canceled) or (not requested_cancel and timed_out)),"CLI did not confirm interruption: "+short(message))
    finally:
        if process and process.poll() is None:
            process.terminate(); process.wait(timeout=8)
        stop(holder)
    check(get_versions()==[v for v in VERSIONS if v!=VERSION] and catalog()==STATE["baseline"]["catalog"],"CLI failure changed catalog/history")
    check(legacy()==STATE["baseline"]["legacy_claim"],"CLI abort changed old claim")
    STATE["cli_interruption"]={"method":"pinned CLI, explicit loopback-only DSN; unique application marker, backend start time, canonical CREATE TRIGGER and blocking holder checked before cancellation",
      "cli_exit":process.returncode,"cancellation_requested":requested_cancel,"error":"user cancellation" if canceled else "lock timeout",
      "sqlstate_text_observed":"57014" if "57014" in message else ("55P03" if "55P03" in message else None),
      "baseline_catalog_equal":True,"history_count":69,"legacy_claim_equal":True}
    save(); print("interrupted real CLI operation recovered with the complete baseline intact")
def apply():
    check(get_versions()==[v for v in VERSIONS if v!=VERSION] and catalog()==STATE["baseline"]["catalog"],"refuse apply: prestate mismatch")
    check(STATE["lock_trial"]["after_failure"]["baseline_catalog_equal"],"failure rehearsal missing")
    check(STATE["cli_interruption"]["baseline_catalog_equal"],"interrupted CLI recovery missing")
    t=time.monotonic()
    result=cli("db","push","--local","--include-all","--yes",env={"PGOPTIONS":"-c lock_timeout=5000 -c statement_timeout=30000"})
    elapsed=round((time.monotonic()-t)*1000)
    ok(result,"isolated migration apply")
    vs=get_versions()
    check(vs==VERSIONS,"complete catalog version list mismatch: inspect before retry")
    after=catalog(); base=STATE["baseline"]["catalog"]
    check(after["mail_revision"]["config"]==['search_path=""'] and not after["mail_revision"]["definer"] and
          "clock_timestamp()" in after["mail_revision"]["body"] and "1 microsecond" in after["mail_revision"]["body"],"bad monotone function")
    check(not after["handoff"]["definer"] and after["handoff"]["config"]==['search_path=""'] and
          (after["handoff"]["anon"],after["handoff"]["authenticated"],after["handoff"]["service"])==(False,False,True),
          "unsafe handoff function")
    check(after["target_trigger"]["enabled"]=="O" and "AFTER INSERT OR UPDATE OF status, detail" in after["target_trigger"]["definition"] and
          "app_private.persist_reservation_notification_outbox()" in after["target_trigger"]["definition"],"wrong trigger")
    check(after["lease_index"]["valid"] and after["lease_index"]["ready"] and
          "(updated_at, id)" in after["lease_index"]["definition"] and "processing" in after["lease_index"]["predicate"],"bad lease index")
    check(after["boundaries"]==base["boundaries"] and after["old_triggers"]==base["old_triggers"],"existing ACL/RLS/trigger changed")
    check(after["mail_revision"]["acl"]==base["mail_revision"]["acl"] and after["mail_revision"]["owner"]==base["mail_revision"]["owner"],"old function privileges changed")
    check(legacy()==STATE["baseline"]["legacy_claim"],"migration retroactively changed old claim")
    plan=cli("db","push","--local","--include-all","--dry-run")
    ok(plan,"post-apply dry-run")
    check(not re.search(r"\b\d{14}_[A-Za-z0-9_]+\.sql\b",plan.stdout+plan.stderr),"up-to-date plan includes migration")
    STATE["applied"]={"method":"Supabase CLI db push --local --include-all --yes","cli_exit":result.returncode,
         "cli_wall_ms":elapsed,"history_count":len(vs),"version_digest":hashlib.sha256("\n".join(vs).encode()).hexdigest(),
         "catalog":after,"legacy_claim_unchanged":True,"next_dry_run_exit":plan.returncode,"next_plan_files":[]}
    save(); print("canonical CLI applied the single historical version",elapsed,"ms")
def deliveries():
    return jsql(f"""select jsonb_build_object(
     'raw_email_claims',(select count(*) from public.reservation_notifications where clinic_id='{A}' and reservation_id='{R}' and notification_type='confirmed'),
     'raw_line_claims',(select count(*) from public.reservation_notifications where clinic_id='{A}' and reservation_id='{R}' and notification_type='reminder_day_before'),
     'email_ledgers',(select count(*) from public.reservation_notifications n join public.email_outbox e on e.id=n.email_outbox_id
        where n.reservation_id='{R}' and n.clinic_id='{A}' and n.notification_type='confirmed' and n.status='enqueued'
        and not(n.detail ? 'enqueue') and e.status='pending' and e.dedupe_key='os145/confirmed'),
     'email_jobs',(select count(*) from public.email_outbox where dedupe_key='os145/confirmed'),
     'line_ledgers',(select count(*) from public.reservation_notifications n join public.line_message_outbox e on e.id=(n.detail->>'line_outbox_id')::uuid
        where n.reservation_id='{R}' and n.clinic_id='{A}' and n.notification_type='reminder_day_before' and n.status='enqueued'
        and not(n.detail ? 'enqueue') and e.status='pending' and e.credential_generation_id='{G}'
        and e.payload #>> '{{reservation,reservationId}}'='{R}' and e.payload #>> '{{reservation,updatedAt}}'='2030-01-01T00:00:00Z'),
     'line_jobs',(select count(*) from public.line_message_outbox where clinic_id='{A}' and message_type='reminder_day_before'));""")
def post():
    check(get_versions()==VERSIONS,"applied version missing")
    zero={k:0 for k in ("raw_email_claims","raw_line_claims","email_ledgers","email_jobs","line_ledgers","line_jobs")}
    check(deliveries()==zero,"fresh synthetic keys required")
    winner=start_psql("os145_new_claim")
    duplicate=start_psql("os145_duplicate")
    mail=pending("confirmed","email")
    line=pending("reminder_day_before","line")
    try:
        send(winner,"begin;\n"+SERVICE+"\n"+mail+";\n"+line+";")
        wait_sql("select count(*) from pg_stat_activity where application_name='os145_new_claim' and state='idle in transaction' and query like '%reminder_day_before%';",lambda v:v=="1","staged uncommitted handoff")
        check(deliveries()==zero,"dirty read of in-flight claim/outbox")
        dup_sql=f"begin;\n{SERVICE}\nwith ins as ({mail}) select count(*) from ins;\nwith ins as ({line}) select count(*) from ins;\ncommit;"
        send(duplicate,dup_sql)
        wait_sql("select exists(select from pg_stat_activity w,pg_stat_activity d where w.application_name='os145_new_claim' and d.application_name='os145_duplicate' and w.pid=any(pg_blocking_pids(d.pid)));",lambda x:x=="t","concurrent duplicate blocking")
        ok(finish(winner,"commit;\n"),"commit first handoffs")
        out=ok(finish(duplicate),"duplicate transaction")
        check(out.splitlines()==["0","0"],"duplicate unexpectedly inserted a claim")
    finally: stop(duplicate); stop(winner)
    committed=deliveries()
    check(all(c==1 for c in committed.values()),"fresh connection could not confirm exactly one email and LINE handoff")
    bad=sql("begin;\n"+SERVICE+"\n"+pending("cancelled","email",customer=C_OTHER)+";\ncommit;")
    check(bad.returncode!=0 and "23514" in bad.stderr and "Reservation notification customer clinic mismatch" in bad.stderr,"unexpected tenant validation result")
    partial=scalar(f"select (select count(*) from public.reservation_notifications where reservation_id='{R}' and notification_type='cancelled') || '/' || (select count(*) from public.email_outbox where dedupe_key='os145/cancelled');")
    check(partial=="0/0","partial invalid notification persisted")
    STATE["persisted"]={"isolation":"separate real DB sessions at READ COMMITTED","before_commit":zero,
       "after_commit_fresh_session":committed,"duplicate_observed_blocked":True,"duplicate_inserted_email":0,"duplicate_inserted_line":0,
       "cross_clinic_rejected":"23514","partial_ledger":0,"partial_email_jobs":0,"legacy_still_unenqueued":legacy()==STATE["baseline"]["legacy_claim"]}
    save(); print("fresh sessions, overlapping requests, both channels and invalid claim verified",committed)
def rollback_guard():
    before=deliveries(); cat=catalog(); hist=get_versions()
    trial=sql(ROLLBACK.read_text(encoding="utf-8"))
    check(trial.returncode!=0 and "P0001" in trial.stderr and "rollback blocked" in trial.stderr,"post-commit guard failed")
    check(before==deliveries() and cat==catalog() and hist==get_versions(),"guard changed committed state")
    STATE["post_commit_rollback"]={"sqlstate":"P0001","canonical_guard_refused":True,"catalog_equal":True,
                                "history_equal":True,"committed_fixture_counts_equal":True,"forward_fix_required":True}
    STATE["when_end"]=now()
    save(); print("post-commit rollback correctly refused; durable fixtures retained")
def tap():
    check(get_versions()==VERSIONS,"pgTAP requires the late-applied catalog")
    before=deliveries()
    # Stock Supabase test db installs pgTAP. Here its bootstrap is inside the test's own rolled-back transaction.
    test_sql=TAP.read_text(encoding="utf-8")
    check(test_sql.count("begin;")==1 and test_sql.rstrip().endswith("rollback;"),"unexpected TAP transaction boundary")
    test_sql=test_sql.replace("begin;","begin;\ncreate extension if not exists pgtap with schema extensions;",1)
    result=sql(test_sql,"os145_pgtap","-c statement_timeout=30000",timeout=180)
    output=ok(result,"canonical Supabase pgTAP")
    good=re.findall(r"(?m)^ok (\d+) - .+$",output)
    plans=re.findall(r"(?m)^1\.\.(\d+)\s*$",output)
    check(len(good)==31 and good==[str(i) for i in range(1,32)] and plans==["31"] and "not ok" not in output,"incomplete or failed TAP report: "+short(output))
    check(before==deliveries() and get_versions()==VERSIONS,"TAP changed committed fixtures/history")
    STATE["pgtap"]={"run":"canonical SQL, PostgreSQL pgTAP extension, psql; extension bootstrap inside the rolled-back test transaction",
                    "passed":31,"failed":0,"planned":31,"exit":result.returncode,"fixture_counts_unchanged":True}
    save(); print("focused pgTAP: 31/31")
if __name__=="__main__":
    guard()
    actions={"baseline":baseline,"dryrun":dryrun,"locks":locks,"interrupted_cli":interrupted_cli,"apply":apply,"post":post,"rollback":rollback_guard,"tap":tap}
    actions[sys.argv[1]]()

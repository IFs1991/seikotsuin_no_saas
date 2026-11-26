"""Materialize only pinned public repository fixtures in this disposable Actions VM."""
import os
from pathlib import Path
import re
import shutil
import subprocess

root = Path(os.environ["GITHUB_WORKSPACE"]).resolve()
scratch = Path(os.environ["RUNNER_TEMP"]) / "issue-145-db"
sha = "04cd5827c9062fbbcd04343f15a63449cbc04a2e"
target = "20260906003219_post_core100_notification_durability.sql"
subprocess.run(["git","diff","--exit-code",sha,"--","supabase"],cwd=root,check=True)
if scratch.exists():
    raise SystemExit("fresh runner required")
files = sorted((root/"supabase/migrations").glob("*.sql"))
if len(files)!=70 or len({f.name.split("_")[0] for f in files})!=70 or target not in [f.name for f in files]:
    raise SystemExit("unexpected deployed migration set")
migrations=scratch/"supabase/migrations"
migrations.mkdir(parents=True)
tests=scratch/"supabase/tests"
tests.mkdir()
for file in files:
    if file.name!=target:
        shutil.copyfile(file,migrations/file.name)
tap=target.replace(".sql","_test.sql")
shutil.copyfile(root/"supabase/tests"/tap,tests/tap)
config=(root/"supabase/config.toml").read_text(encoding="utf-8")
config=config.replace('project_id = "seikotsuin_management_saas"','project_id = "os145rehearsal261126a"')
for old,new in ((54320,57420),(54329,57429),(54331,57431),(54332,57432),(54333,57433),(54334,57434),(54337,57437),(8083,58483)):
    config=config.replace(f"port = {old}",f"port = {new}")
config,n=re.subn(r"(?ms)(^\[db\.seed\][^\[]*?^enabled = )true",r"\g<1>false",config)
if n!=1 or "port = 57432" not in config:
    raise SystemExit("expected isolated configuration")
(scratch/"supabase/config.toml").write_text(config,encoding="utf-8")
for filename in ("verify.py","catalog.sql"):
    shutil.copyfile(root/".github/issue145-rehearsal"/filename,scratch/filename)
print("Disposable Supabase fixture contains 69 versions including both later migrations; application seeds disabled.")

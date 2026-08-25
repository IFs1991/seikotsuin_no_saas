# Rollback — Tiramisu Works LP Integration v0.1

This change has no database migration and therefore requires no SQL rollback.

## Rollback procedure

1. Revert the Tiramisu Works LP feature commit(s) on the deployment branch.
2. Redeploy the previous application revision.
3. Verify `/` still serves the Tiramisu OS landing page.
4. Verify `/works` returns the expected not-found response after rollback.
5. Remove `NEXT_PUBLIC_WORKS_FORM_URL` from the deployment environment only when no other release uses it.

## Data impact

None. The public LP does not write to product tables, authentication state, tenant configuration, or billing records.

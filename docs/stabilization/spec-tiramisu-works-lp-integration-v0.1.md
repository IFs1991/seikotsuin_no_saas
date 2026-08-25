# Tiramisu Works LP Integration v0.1

## Status

- Scope: public landing pages only
- Mode: EXTEND
- Database migration: none
- Auth / RLS / tenant scope: unchanged
- Rollback: revert the feature commit(s)

## Route contract

| Route | Product | Audience | Primary action |
|---|---|---|---|
| `/` | Tiramisu OS | 5+ location groups requiring headquarters management | demo / document request |
| `/works` | Tiramisu Works | small teams requiring existing-tool integration and AI workflow implementation | Works consultation |

## Integration contract

1. `/works` MUST remain a public route.
2. Works styles MUST be scoped below `.works-root` and MUST NOT alter authenticated screens.
3. Works CTA resolution MUST prefer `NEXT_PUBLIC_WORKS_FORM_URL` and MAY fall back to `NEXT_PUBLIC_LP_FORM_URL`.
4. The root LP MUST retain Tiramisu OS as its primary hero and primary CTA.
5. Cross-product navigation MUST describe product fit without presenting artificial scarcity or hiding material pricing information.
6. No database, auth, billing, webhook, or external write action is introduced by this LP integration.

## Acceptance criteria

- `/works` returns a successful page response and renders its main heading.
- The root LP exposes a discoverable link to `/works` without replacing the existing OS CTA.
- Works integration images load from local public assets.
- Desktop and mobile layouts remain usable.
- Type-check, targeted lint, build, and the Works Playwright test pass.
- Final production deployment has a reviewed Works form URL and current provider-logo approvals.

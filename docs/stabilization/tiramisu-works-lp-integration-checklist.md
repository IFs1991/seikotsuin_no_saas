# Tiramisu Works LP Integration Checklist

## Scope

- [x] Keep the existing Tiramisu OS landing page at `/`.
- [x] Add the supplied Tiramisu Works landing page at `/works`.
- [x] Add explicit product-family navigation between the two pages.
- [x] Keep Works styling scoped and independent from authenticated screens.
- [x] Keep Works inquiries configurable with `NEXT_PUBLIC_WORKS_FORM_URL`.

## Pre-merge verification

- [ ] Confirm `/works` renders at desktop and mobile widths.
- [ ] Confirm every integration icon has meaningful alt text or is marked decorative.
- [ ] Confirm all CTA links resolve to the intended Works inquiry form.
- [ ] Confirm `/`, `/login`, and `/admin/login` still render and navigate correctly.
- [ ] Confirm the root LP product router does not obscure the primary Tiramisu OS CTA.
- [ ] Run `npm run type-check`.
- [ ] Run targeted ESLint for changed TS/TSX files.
- [ ] Run `npm run build`.
- [ ] Run the Works Playwright spec.
- [ ] Review external service logo usage against each provider's current brand guidelines before production publication.

## Deployment configuration

```env
NEXT_PUBLIC_WORKS_FORM_URL=https://example.com/works-inquiry
```

When unset, the Works CTA falls back to `NEXT_PUBLIC_LP_FORM_URL` through `src/components/public/works-links.ts`.

## Rollback

No schema, migration, RLS, auth, or API changes are included. Revert the LP feature commit to remove `/works` and the cross-product links.

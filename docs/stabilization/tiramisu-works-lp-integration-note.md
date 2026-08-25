# Tiramisu Works LP Integration Note

## Design Rationale

### Mode

- [x] EXTEND
- [ ] CREATE
- [ ] REDESIGN

The existing Tiramisu OS landing page remains the primary `/` route. The supplied Tiramisu Works implementation is added as a separate public product page at `/works`, with only small cross-product navigation changes to the existing page.

### User problem

Small teams using LINE, booking tools, Google, Instagram, Slack, and ChatGPT need a clear route to Tiramisu Works without weakening the existing 5+ clinic Tiramisu OS positioning.

### Bottleneck diagnosis

- [x] Choice overload
- [x] Unclear product boundary
- [x] Purchase / adoption anxiety
- [ ] Other

### Selected pattern

- Pattern ID: P01 Choice Reduction / P02 Target Size and Proximity / P07 Framing
- Why this pattern fits: visitors need a small, explicit choice between OS-level multi-store management and workflow implementation using existing tools. The change avoids mixing both offers into a single hero or pricing table.

### UI change

- Add the supplied Tiramisu Works LP at `/works`.
- Replace the decorative prefecture marquee on `/` with a two-option product-family router.
- Add a small `Tiramisu Works` link to the existing header and footer.
- Replace the ambiguous single-store price note with an explicit Works route.
- Keep all Works styles scoped below `.works-root`.

### Copy change

- Describe Tiramisu OS as the 5+ location / headquarters-management option.
- Describe Tiramisu Works as the existing-tool integration / AI workflow implementation option.
- State that store count is a guide and the current operational problem determines the product fit.

### Ethics Gate

- User benefit: clarifies product fit and avoids steering small operators toward an unsuitable OS implementation.
- Reversible / easy to undo: yes; the Works route and cross-links can be removed independently.
- Factually accurate: copy is limited to the supplied offer scope and published product positioning.
- Reject / cancel path remains clear: not applicable; no checkout or irreversible action is added.
- No hidden cost: pricing and external-service-cost notes remain visible on the Works page.
- No artificial urgency / scarcity: none added.
- Long-term trust risk: low; the page explicitly retains human approval and notes integration limitations.

### Visual conformance

- Tokens reused: existing dark slate, copper, warm paper, typography, spacing, radius, and focus patterns.
- New tokens introduced: Works-only CSS custom properties scoped below `.works-root`.
- Global styles touched: none.
- Screens outside the task scope visually affected: only the public `/` LP receives small product-family navigation changes.

### Metrics

- Primary metric: visits from `/` to `/works`, Works CTA clicks, qualified Works inquiries.
- Guardrail metrics: root LP demo CTA conversion, bounce rate on `/`, support inquiries caused by product confusion.
- Events added / reused: no analytics provider was added in this PR; route and CTA measurement can use the existing analytics layer when configured.

### Rollback plan

Revert the single feature commit. No database, authentication, migration, billing, or protected-route changes are involved.

## Validation

- `npm run type-check`
- targeted ESLint for changed TS/TSX files
- `npm run build`
- Playwright test for `/works`

Execution evidence belongs in the pull request description and CI results. Do not infer production readiness from the static preview alone.

# Tiramisu Works LP Local Validation

## Scope under validation

- Public route: `/works`
- Existing public route: `/`
- Works assets under `public/images/works/integrations/`
- Works form resolution through `NEXT_PUBLIC_WORKS_FORM_URL`
- Root LP product-family routing

## Commands executed in the prepared repository worktree

```powershell
npm ci --ignore-scripts
npx prettier --write "src/app/(public)/page.tsx" "src/app/(public)/works/page.tsx" "src/app/(public)/works/works-styles.css" "src/components/public/works-content.ts" "src/components/public/works-links.ts" "src/components/public/works-integration-icon.tsx" "src/__tests__/e2e-playwright/works-lp.spec.ts"
npm run type-check
npx eslint --quiet "src/app/(public)/page.tsx" "src/app/(public)/works/page.tsx" "src/components/public/works-content.ts" "src/components/public/works-links.ts" "src/components/public/works-integration-icon.tsx"
npm run build
$env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:3100"
npx playwright test "src/__tests__/e2e-playwright/works-lp.spec.ts" --project=chromium
```

## Result

The local integration workflow completed without a command failure before the branch was pushed. GitHub CI remains the merge authority because the local environment is not the production environment and does not validate provider brand approvals or the final inquiry-form URL.

## Not validated by this change

- Production Vercel environment variables
- Actual Google Form / CRM submission
- Analytics event ingestion
- Provider trademark approval
- Any authenticated product workflow, database policy, or tenant isolation behavior (not modified by this change)

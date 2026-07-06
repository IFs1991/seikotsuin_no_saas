# Sentry Release and Source Maps

## Required production environment

- `SENTRY_DSN`: enables Sentry initialization.
- `SENTRY_AUTH_TOKEN`: enables source map upload during `next build`.
- `SENTRY_ORG`: Sentry organization slug used by the Next.js Sentry plugin.
- `SENTRY_PROJECT`: Sentry project slug used by the Next.js Sentry plugin.
- `SENTRY_RELEASE`: preferred release identifier. If omitted, the app falls back to `VERCEL_GIT_COMMIT_SHA` or `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`.

## Build behavior

`next.config.js` wraps the production config with `withSentryConfig()` only when `SENTRY_DSN` is present. The Sentry plugin uploads source maps during `npm run build` when the auth token, organization, project, and release metadata are available.

Uploaded source maps are deleted from the local build output after upload by `sourcemaps.deleteSourcemapsAfterUpload`.

## Verification

Before production deployment, confirm the deployment environment contains the required Sentry variables and run:

```powershell
npm run build
```

Then verify in Sentry that the release named by `SENTRY_RELEASE` or the Vercel commit SHA exists and contains uploaded artifacts.

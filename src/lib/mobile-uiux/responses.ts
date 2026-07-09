import { NextResponse } from 'next/server';

export type MobileUiuxResourceKind = 'html' | 'script';

type MobileUiuxAccessDeniedLike = {
  status: 401 | 403 | 404;
  reasonCode: string;
  message: string;
};

interface MobileUiuxErrorResponseInput {
  status: 401 | 403 | 404;
  reasonCode: string;
  message: string;
  resourceKind: MobileUiuxResourceKind;
}

const STATUS_TITLES: Record<401 | 403 | 404, string> = {
  401: 'ログインが必要です',
  403: 'アクセス権限がありません',
  404: 'ページを表示できません',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildErrorHtml(input: MobileUiuxErrorResponseInput): string {
  const title = STATUS_TITLES[input.status];
  const escapedTitle = escapeHtml(title);
  const escapedMessage = escapeHtml(input.message);
  const escapedReasonCode = escapeHtml(input.reasonCode);

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #111827;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    main {
      width: min(100%, 420px);
    }
    h1 {
      margin: 0 0 12px;
      font-size: 24px;
      line-height: 1.3;
    }
    p {
      margin: 0;
      font-size: 15px;
      line-height: 1.8;
      color: #374151;
    }
    .support-code {
      margin-top: 20px;
      font-size: 12px;
      color: #6b7280;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        background: #030712;
        color: #f9fafb;
      }
      p {
        color: #d1d5db;
      }
      .support-code {
        color: #9ca3af;
      }
    }
  </style>
</head>
<body>
  <main data-mobile-uiux-error-page>
    <h1>${escapedTitle}</h1>
    <p>${escapedMessage}</p>
    <p class="support-code">Code: ${escapedReasonCode}</p>
  </main>
</body>
</html>`;
}

export function getMobileUiuxResourceKind(
  resource: string
): MobileUiuxResourceKind {
  return resource.toLowerCase().endsWith('.js') ? 'script' : 'html';
}

export function createMobileUiuxErrorResponse(
  input: MobileUiuxErrorResponseInput
): NextResponse {
  if (input.resourceKind === 'script') {
    return NextResponse.json(
      {
        success: false,
        error: input.message,
        reasonCode: input.reasonCode,
      },
      { status: input.status }
    );
  }

  return new NextResponse(buildErrorHtml(input), {
    status: input.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

export function createMobileUiuxAccessErrorResponse(
  denial: MobileUiuxAccessDeniedLike,
  resourceKind: MobileUiuxResourceKind
): NextResponse {
  return createMobileUiuxErrorResponse({
    status: denial.status,
    reasonCode: denial.reasonCode,
    message: denial.message,
    resourceKind,
  });
}

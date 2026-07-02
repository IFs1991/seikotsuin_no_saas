import { HTMLElement, Node, NodeType, parse } from 'node-html-parser';

import type { MobileUiuxScreenResource } from './bridge-manifest';

export type MobileUiuxHtmlShellMode = 'production' | 'preview';

const MOBILE_UIUX_NAV_LABEL_TO_TARGET = {
  ホーム: 'home',
  予約: 'reservations',
  患者: 'patients',
  レポート: 'daily-reports',
  日報: 'daily-reports',
  設定: 'settings',
} as const satisfies Record<string, MobileUiuxScreenResource>;

const MOBILE_UIUX_NAV_REQUIRED_RESOURCES = [
  'home',
  'reservations',
  'patients',
  'daily-reports',
  'settings',
  'settings-detail',
] as const satisfies readonly MobileUiuxScreenResource[];

const PRODUCTION_SHELL_STYLE = `
<style data-mobile-uiux-production-shell>
html, body { margin: 0; padding: 0; min-height: 100%; }
body[data-mobile-uiux-shell="production"] {
  width: 100%;
  min-height: 100svh;
  background: var(--screen-bg, #f3f5f4);
  overflow: hidden;
}
[data-mobile-uiux-production-root] {
  width: 100% !important;
  min-height: 100svh !important;
  height: 100svh !important;
  overflow: hidden !important;
  background: var(--screen-bg, #f3f5f4) !important;
  padding: 0 !important;
  gap: 0 !important;
  align-items: stretch !important;
  box-sizing: border-box !important;
}
[data-screen-label] {
  width: 100% !important;
  height: 100svh !important;
  min-height: 100svh !important;
  border-radius: 0 !important;
}
.scrl { -webkit-overflow-scrolling: touch; }
</style>`;

type TransformOptions = {
  mode: MobileUiuxHtmlShellMode;
  resource: MobileUiuxScreenResource;
};

type PreservedDcScript = {
  block: string;
  openingTag: string;
};

type NavItem = {
  element: HTMLElement;
  label: keyof typeof MOBILE_UIUX_NAV_LABEL_TO_TARGET;
  target: MobileUiuxScreenResource;
};

export function transformMobileUiuxHtml(
  html: string,
  options: TransformOptions
): string {
  if (options.mode === 'preview') {
    return html;
  }

  const preservedDcScript = extractSingleDcScript(html);
  if (!preservedDcScript.block.includes('class Component extends DCLogic')) {
    throw new Error('Mobile UIUX DC script is missing Component DCLogic class');
  }

  const root = parse(html, {
    comment: true,
    blockTextElements: {
      script: true,
      style: true,
      pre: true,
    },
  });

  const xDc = requireSingleElement(root.querySelectorAll('x-dc'), '<x-dc>');
  const scriptElements = root.querySelectorAll('script[data-dc-script]');
  requireSingleElement(scriptElements, 'script[data-dc-script]');

  const stageRoot = findStageRoot(xDc);
  const phoneFrame = findIphoneFrame(stageRoot);
  const appScreen = requireSingleElement(
    phoneFrame.querySelectorAll('[data-screen-label]'),
    '[data-screen-label]'
  );

  removeFakeDeviceChrome(appScreen);
  annotateBottomNav(appScreen, options.resource);
  removeProductionOnlySampleBlocks(appScreen, options.resource);
  stageRoot.setAttribute('data-mobile-uiux-production-root', '');

  appScreen.remove();
  stageRoot.set_content('');
  stageRoot.appendChild(appScreen);

  updateViewportMeta(root);
  addProductionShellStyle(root);
  const body = requireSingleElement(root.getElementsByTagName('body'), 'body');
  body.setAttribute('data-mobile-uiux-shell', 'production');

  const transformedHtml = replaceDcScript(root.toString(), preservedDcScript);
  return options.resource === 'settings-detail'
    ? stripTrailingLineWhitespace(transformedHtml)
    : transformedHtml;
}

function requireSingleElement(
  elements: readonly HTMLElement[],
  label: string
): HTMLElement {
  if (elements.length !== 1) {
    throw new Error(
      `Expected exactly one ${label} in Mobile UIUX shell, found ${elements.length}`
    );
  }

  return elements[0];
}

function findStageRoot(xDc: HTMLElement): HTMLElement {
  const stageRoot = elementChildren(xDc).find(
    child =>
      child.rawTagName.toLowerCase() !== 'helmet' &&
      child.getAttribute('ref') === '{{ setRoot }}'
  );

  if (!stageRoot) {
    throw new Error(
      'Mobile UIUX stage root with ref="{{ setRoot }}" not found'
    );
  }

  return stageRoot;
}

function findIphoneFrame(stageRoot: HTMLElement): HTMLElement {
  const candidates = elementChildren(stageRoot).filter(child => {
    const style = normalizeStyle(child.getAttribute('style'));
    return (
      style.includes('width:390px') &&
      style.includes('height:812px') &&
      style.includes('border-radius:56px') &&
      child.querySelectorAll('[data-screen-label]').length === 1
    );
  });

  return requireSingleElement(candidates, 'iPhone mock frame');
}

function removeFakeDeviceChrome(appScreen: HTMLElement): void {
  for (const child of elementChildren(appScreen)) {
    if (isDynamicIsland(child) || isFakeStatusBar(child)) {
      child.remove();
    }
  }
}

function removeProductionOnlySampleBlocks(
  appScreen: HTMLElement,
  resource: MobileUiuxScreenResource
): void {
  if (resource !== 'settings-detail') {
    return;
  }

  removeSettingsDetailTemplateBlock(appScreen);
}

function removeSettingsDetailTemplateBlock(appScreen: HTMLElement): void {
  const templateLabel = walkElements(appScreen).find(
    element => element.text.trim() === 'メニューテンプレート'
  );
  const templateBlock = templateLabel
    ? findNearestOverflowHiddenBlock(templateLabel, appScreen)
    : null;

  templateBlock?.remove();
}

function findNearestOverflowHiddenBlock(
  element: HTMLElement,
  appScreen: HTMLElement
): HTMLElement | null {
  let current: Node | null = element.parentNode;
  while (current && current !== appScreen) {
    if (isHTMLElement(current)) {
      const style = normalizeStyle(current.getAttribute('style'));
      if (style.includes('overflow:hidden')) {
        return current;
      }
    }
    current = current.parentNode;
  }

  return null;
}

function isDynamicIsland(element: HTMLElement): boolean {
  const style = normalizeStyle(element.getAttribute('style'));
  return (
    style.includes('position:absolute') &&
    style.includes('top:13px') &&
    style.includes('width:108px') &&
    style.includes('height:30px') &&
    (style.includes('background:#000') || style.includes('background:#000000'))
  );
}

function isFakeStatusBar(element: HTMLElement): boolean {
  const style = normalizeStyle(element.getAttribute('style'));
  return (
    style.includes('height:50px') &&
    style.includes('flex:none') &&
    style.includes('justify-content:space-between')
  );
}

function annotateBottomNav(
  appScreen: HTMLElement,
  resource: MobileUiuxScreenResource
): void {
  const navItems = findBottomNavItems(appScreen);
  const requiresNav = MOBILE_UIUX_NAV_REQUIRED_RESOURCES.includes(resource);

  if (requiresNav && navItems.length !== 5) {
    throw new Error(
      `Expected Bottom Nav 5 items for ${resource}, found ${navItems.length}`
    );
  }

  for (const item of navItems) {
    item.element.setAttribute('data-mobile-uiux-nav-target', item.target);
    item.element.setAttribute('role', 'button');
    item.element.setAttribute('tabindex', '0');
    item.element.setAttribute('aria-label', `${item.label}へ移動`);
  }
}

function findBottomNavItems(appScreen: HTMLElement): NavItem[] {
  for (const element of walkElements(appScreen)) {
    const directChildren = elementChildren(element);
    if (directChildren.length !== 5) {
      continue;
    }

    const navItems = directChildren
      .map(child => toNavItem(child))
      .filter((item): item is NavItem => item !== null);

    if (navItems.length === 5) {
      return navItems;
    }
  }

  return [];
}

function toNavItem(element: HTMLElement): NavItem | null {
  const label = element
    .querySelectorAll('span')
    .map(span => span.text.trim())
    .find(isMobileUiuxNavLabel);

  if (!label) {
    return null;
  }

  return {
    element,
    label,
    target: MOBILE_UIUX_NAV_LABEL_TO_TARGET[label],
  };
}

function isMobileUiuxNavLabel(
  value: string
): value is keyof typeof MOBILE_UIUX_NAV_LABEL_TO_TARGET {
  return Object.prototype.hasOwnProperty.call(
    MOBILE_UIUX_NAV_LABEL_TO_TARGET,
    value
  );
}

function walkElements(root: HTMLElement): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const visit = (element: HTMLElement) => {
    elements.push(element);
    for (const child of elementChildren(element)) {
      visit(child);
    }
  };

  visit(root);
  return elements;
}

function elementChildren(element: HTMLElement): HTMLElement[] {
  return element.childNodes.filter(isHTMLElement);
}

function isHTMLElement(node: Node): node is HTMLElement {
  return node.nodeType === NodeType.ELEMENT_NODE;
}

function updateViewportMeta(root: HTMLElement): void {
  const head = requireSingleElement(root.getElementsByTagName('head'), 'head');
  const viewportMeta = head
    .getElementsByTagName('meta')
    .find(meta => meta.getAttribute('name') === 'viewport');

  if (viewportMeta) {
    viewportMeta.setAttribute(
      'content',
      ensureViewportFitCover(viewportMeta.getAttribute('content') ?? '')
    );
    return;
  }

  head.insertAdjacentHTML(
    'beforeend',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
  );
}

function ensureViewportFitCover(content: string): string {
  const parts = content
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0);

  if (!parts.some(part => part.toLowerCase() === 'viewport-fit=cover')) {
    parts.push('viewport-fit=cover');
  }

  return parts.join(', ');
}

function addProductionShellStyle(root: HTMLElement): void {
  if (root.querySelector('style[data-mobile-uiux-production-shell]')) {
    return;
  }

  const head = requireSingleElement(root.getElementsByTagName('head'), 'head');
  head.insertAdjacentHTML('beforeend', PRODUCTION_SHELL_STYLE);
}

function extractSingleDcScript(html: string): PreservedDcScript {
  const matches = [
    ...html.matchAll(
      /<script\b(?=[^>]*\bdata-dc-script\b)[^>]*>[\s\S]*?<\/script>/gi
    ),
  ];

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one script[data-dc-script], found ${matches.length}`
    );
  }

  const block = matches[0][0];
  const openingTagMatch = block.match(/^<script\b[^>]*>/i);
  if (!openingTagMatch) {
    throw new Error('Mobile UIUX DC script opening tag not found');
  }

  return {
    block,
    openingTag: openingTagMatch[0],
  };
}

function replaceDcScript(
  transformedHtml: string,
  preservedDcScript: PreservedDcScript
): string {
  const matches = [
    ...transformedHtml.matchAll(
      /<script\b(?=[^>]*\bdata-dc-script\b)[^>]*>[\s\S]*?<\/script>/gi
    ),
  ];

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one transformed script[data-dc-script], found ${matches.length}`
    );
  }

  return transformedHtml.replace(matches[0][0], preservedDcScript.block);
}

function normalizeStyle(style: string | undefined): string {
  return (style ?? '').toLowerCase().replace(/\s+/g, '');
}

function stripTrailingLineWhitespace(html: string): string {
  return html.replace(/[ \t]+$/gm, '');
}

export function getMobileUiuxDcScriptOpeningTag(html: string): string {
  return extractSingleDcScript(html).openingTag;
}

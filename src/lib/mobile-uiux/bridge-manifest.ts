import 'server-only';

import {
  MOBILE_UIUX_BOTTOM_NAV_TARGETS_BY_ROLE,
  MOBILE_UIUX_NAV_PATH_BY_TARGET,
} from '@/lib/mobile-uiux/navigation';

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

export function getMobileUiuxBridgeScript(
  env: NodeJS.ProcessEnv = process.env
): string {
  const realDataEnabled = parseBooleanFlag(env.MOBILE_UIUX_REAL_DATA_ENABLED);
  const navPathJson = JSON.stringify(MOBILE_UIUX_NAV_PATH_BY_TARGET);
  const targetsByRoleJson = JSON.stringify(
    MOBILE_UIUX_BOTTOM_NAV_TARGETS_BY_ROLE
  );

  return `"use strict";
(() => {
  const REAL_DATA_ENABLED = ${JSON.stringify(realDataEnabled)};
  const NAV_PATH_BY_TARGET = ${navPathJson};
  const NAV_TARGETS_BY_ROLE = ${targetsByRoleJson};
  const NAV_TARGET_ORDER = ["home", "reservations", "patients", "daily-reports", "settings"];
  let currentContext = null;
  let navObserver = null;

  function getNormalizedPathname() {
    return window.location.pathname.replace(/\\/$/, "") || "/";
  }

  function getCurrentCanonicalRole() {
    return currentContext &&
      currentContext.role &&
      typeof currentContext.role.canonical === "string"
        ? currentContext.role.canonical
        : null;
  }

  function canNavigateToTarget(target) {
    if (!REAL_DATA_ENABLED) {
      return true;
    }

    const role = getCurrentCanonicalRole();
    const allowedTargets = NAV_TARGETS_BY_ROLE[role] || [];
    return allowedTargets.includes(target);
  }

  function navigateToTarget(target) {
    if (!canNavigateToTarget(target)) {
      return;
    }

    const nextPath = NAV_PATH_BY_TARGET[target];
    if (!nextPath || getNormalizedPathname() === nextPath) {
      return;
    }

    window.location.assign(nextPath);
  }

  function findBottomNav() {
    const candidates = Array.from(document.querySelectorAll("div"));
    return candidates.find((element) => {
      const style = element.getAttribute("style") || "";
      return style.includes("border-top") &&
        style.includes("padding: 8px 8px 24px") &&
        element.children.length >= NAV_TARGET_ORDER.length;
    }) || null;
  }

  function bindBottomNav() {
    const nav = findBottomNav();
    if (!nav || nav.getAttribute("data-mobile-uiux-bridge-bound") === "true") {
      return;
    }

    nav.setAttribute("data-mobile-uiux-bridge-bound", "true");
    NAV_TARGET_ORDER.forEach((target, index) => {
      const item = nav.children[index];
      if (!(item instanceof HTMLElement)) {
        return;
      }

      item.setAttribute("data-mobile-uiux-nav-target", target);
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.addEventListener("click", () => navigateToTarget(target));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigateToTarget(target);
        }
      });
    });
  }

  function loadContext() {
    if (!REAL_DATA_ENABLED) {
      return Promise.resolve();
    }

    return fetch("/api/mobile-uiux/context", {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" }
    }).then((response) => {
      if (!response.ok) {
        currentContext = null;
        return null;
      }
      return response.json();
    }).then((payload) => {
      currentContext = payload && payload.success === true ? payload : null;
    }).catch(() => {
      currentContext = null;
    });
  }

  function start() {
    void loadContext().then(bindBottomNav);
    bindBottomNav();
    navObserver = new MutationObserver(bindBottomNav);
    navObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function disconnect() {
    if (navObserver) {
      navObserver.disconnect();
      navObserver = null;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.__mobileUiuxBridge = {
    canNavigateToTarget,
    navigateToTarget,
    getCurrentCanonicalRole,
    disconnect
  };
})();`;
}

// getPageIdentifiers.js — Injected into the PAGE context (not content script)
// This file has access to window.s, window.alloy, window._satellite etc.

// =====================
// Page Identifier Fetch
// =====================
window.addEventListener("fetchPageWindowPathIdentifiers", (e) => {
  function getValueByPath(obj, path) {
    // Supports dot notation, bracket notation, and mixed:
    // "s.pageName" → ["s", "pageName"]
    // "datalayer.adobe['sdk.customPageName']" → ["datalayer", "adobe", "sdk.customPageName"]
    // 'window["some.key"]["nested"]' → ["some.key", "nested"]
    const keys = [];
    // Match: .key, ['key'], ["key"], or leading key
    const regex = /(?:^|\.)\s*([a-zA-Z_$][\w$]*)|(?:\[\s*['"](.+?)['"]\s*\])|(?:\[\s*(\d+)\s*\])/g;
    let match;
    while ((match = regex.exec(path)) !== null) {
      keys.push(match[1] || match[2] || match[3]);
    }
    if (keys.length === 0) {
      // Fallback: simple dot split for basic paths
      keys.push(...path.split("."));
    }
    return keys.reduce((o, k) => o?.[k], obj);
  }
  pageIdentifier = { ...e.detail };
  let value = getValueByPath(window, pageIdentifier.windowPath);
  pageIdentifier.value = value;
  window.dispatchEvent(
    new CustomEvent("pageIdentifierWindowPathValue", {
      detail: { pageIdentifier },
    }),
  );
});

// =====================
// Adobe Analytics Detection
// =====================
window.addEventListener("isAdobeAnalyticsImplemented", () => {
  let adobeAnalyticsImplemented = false;
  if (
    (window.alloy && typeof window.alloy === "function") ||
    (window.s && (typeof window.s === "object" || typeof window.s === "function")) ||
    (window._satellite && typeof window._satellite === "object")
  ) {
    adobeAnalyticsImplemented = true;
  }
  if (window.location.hostname.includes("adobe.com")) {
    adobeAnalyticsImplemented = false;
  }
  window.dispatchEvent(new CustomEvent("isAdobeAnalyticsImplementedResponse", { detail: { adobeAnalyticsImplemented } }));
});

// =====================
// SPA Navigation Detection
// =====================
// Monkey-patch History API to detect SPA navigations
// This runs in the page context so it can intercept framework-level navigation
(function () {
  let lastUrl = location.href;

  function notifyNavigation() {
    const newUrl = location.href;
    if (newUrl !== lastUrl) {
      lastUrl = newUrl;
      window.dispatchEvent(new CustomEvent("spaNavigationDetected", { detail: { url: newUrl } }));
    }
  }

  // Patch pushState
  const originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(this, arguments);
    notifyNavigation();
  };

  // Patch replaceState
  const originalReplaceState = history.replaceState;
  history.replaceState = function () {
    originalReplaceState.apply(this, arguments);
    notifyNavigation();
  };

  // Listen for popstate (browser back/forward)
  window.addEventListener("popstate", () => {
    // Small delay to let the URL update
    setTimeout(notifyNavigation, 50);
  });

  // Fallback: URL polling for edge cases (hashchange, exotic frameworks)
  // Checks every 2 seconds — lightweight since it's just a string comparison
  setInterval(() => {
    notifyNavigation();
  }, 2000);
})();

// inject.js
window.addEventListener("fetchPageWindowPathIdentifiers", (e) => {
  function getValueByPath(obj, path) {
    return path.split(".").reduce((o, k) => o?.[k], obj);
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

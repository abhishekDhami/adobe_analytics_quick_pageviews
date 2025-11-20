// inject.js
window.addEventListener("fetchPageIdentifiers", () => {
  let pageIdentifier = [];
  if (window.s?.pageName) {
    let sPageName = window.s.pageName;
    if (sPageName) pageIdentifier.push(sPageName.slice(0, 95));
  }
  if (window._satellite?.getVar("pageName")) {
    let satellitePageName = window._satellite.getVar("pageName");
    if (satellitePageName) pageIdentifier.push(satellitePageName.slice(0, 95));
  }
  if (document.title) pageIdentifier.push(document.title.slice(0, 95));
  let pageURL = document.location.href;
  pageIdentifier.push(pageURL.slice(0, 95)); // limit length
  window.dispatchEvent(new CustomEvent("pageIdentifiersResponse", { detail: { pageIdentifier: pageIdentifier } }));
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
  window.dispatchEvent(new CustomEvent("isAdobeAnalyticsImplementedResponse", { detail: { adobeAnalyticsImplemented } }));
});

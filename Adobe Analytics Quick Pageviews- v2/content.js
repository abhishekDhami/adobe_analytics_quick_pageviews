let widgetData = {};
let badgeElem = null;
let adobeAnalyticsImplemented = null;
let extCustomTimerID = null;
let pageIdentifier = {};
let chartInstances = {};
let currentDatePreset = "7d"; // default preset
let spaDebounceTimer = null;
const SPA_DEBOUNCE_MS = 1500; // debounce SPA navigation re-fetches

function inInitCharts() {
  Chart.defaults.color = "#ddd";
  Chart.defaults.borderColor = "#333";
  Chart.defaults.font.size = 8;
  Chart.defaults.font.family = "Arial";
}
inInitCharts();

//Injecting script to the page
window.addEventListener("load", () => {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("getPageIdentifiers.js");
  (document.head || document.documentElement).appendChild(script);
});

window.addEventListener("load", async () => {
  // ---------- Checking if widget is enable ----------
  const isWidgetEnabled = await getEnableOnPageFlag();
  if (isWidgetEnabled == false) return;

  // Load saved date preset
  currentDatePreset = await getSavedDatePreset();

  //Get page identifiers from injected script
  await delay(1); // wait for 1 second to get the identifiers
  window.dispatchEvent(new CustomEvent("isAdobeAnalyticsImplemented"));
  loadWidgetOnThePage();
});

window.addEventListener("isAdobeAnalyticsImplementedResponse", (e) => {
  if (e.detail.adobeAnalyticsImplemented) adobeAnalyticsImplemented = true;
  else adobeAnalyticsImplemented = false;
});

window.addEventListener("pageIdentifierWindowPathValue", async (e) => {
  if (!e.detail || !e.detail.pageIdentifier) return;
  pageIdentifier.value = e.detail.pageIdentifier.value;
  await window.updateWidgetWithPageData();
});

// =====================
// SPA Navigation Handler
// =====================
window.addEventListener("spaNavigationDetected", (e) => {
  // Debounce rapid navigations
  if (spaDebounceTimer) clearTimeout(spaDebounceTimer);
  spaDebounceTimer = setTimeout(() => {
    handleSpaNavigation();
  }, SPA_DEBOUNCE_MS);
});

async function handleSpaNavigation() {
  // Only proceed if widget is loaded and enabled
  if (!document.getElementById("aa-extension-root")) return;
  if (!adobeAnalyticsImplemented) return;

  // Re-fetch page identifiers and update widget
  if (typeof window.refetchPageDataForSpa === "function") {
    await window.refetchPageDataForSpa();
  }
}

function delay(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// =====================
// Date Preset Helpers
// =====================
function getSavedDatePreset() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "GET_DATE_PRESET" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve("7d");
        return;
      }
      resolve(response?.datePreset || "7d");
    });
  });
}

function saveDatePreset(preset) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "SET_DATE_PRESET", datePreset: preset }, (response) => {
      if (chrome.runtime.lastError) {
        resolve();
        return;
      }
      resolve();
    });
  });
}

const DATE_PRESET_LABELS = {
  "7d": "Last 7 Days",
  "3w": "Last 3 Weeks",
  "5w": "Last 5 Weeks",
  "3m": "Last 3 Months",
  "6m": "Last 6 Months",
};

function formatLargeNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  num = Number(num);
  if (num < 0) return "-" + formatLargeNumber(Math.abs(num));
  if (num >= 1_000_000_000) {
    const val = num / 1_000_000_000;
    return val % 1 === 0 ? val.toFixed(0) + "B" : val.toFixed(2).replace(/\.?0+$/, "") + "B";
  }
  if (num >= 1_000_000) {
    const val = num / 1_000_000;
    return val % 1 === 0 ? val.toFixed(0) + "M" : val.toFixed(2).replace(/\.?0+$/, "") + "M";
  }
  return num.toLocaleString();
}

async function loadWidgetOnThePage() {
  //load widget only if Adobe Analytics is implemented on the page
  if (adobeAnalyticsImplemented === null) {
    setTimeout(loadWidgetOnThePage, 3000);
    return;
  }
  if (adobeAnalyticsImplemented == false) return;
  // prevent double-injection
  if (document.getElementById("aa-extension-root")) {
    return;
  }
  // ---------- create host ----------
  const host = document.createElement("div");
  host.id = "aa-extension-root";
  // make host non-intrusive but allow children to accept events
  host.style.all = "initial";
  document.documentElement.appendChild(host);

  // ---------- shadow ----------
  const shadow = host.attachShadow({ mode: "open" });

  // ---------- styles ----------
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }

    .badge {
      position: fixed;
      top: 120px;
      right: 8px;
      width: 200px;
      max-width:  50vw;
      min-width: 200px;
      max-height: 95vh;
      color: #fff;
      background: #111;
      border-left: 3px solid #75c8bb;
      border-radius: 8px 0 0 8px;
      box-shadow: -4px 4px 18px rgba(0, 0, 0, .5);

      transition: 
        max-width 0.28s cubic-bezier(.4,0,.2,1),
        opacity 0.18s ease;
      pointer-events: auto;
      font-family: Arial, Helvetica, sans-serif;

      overflow: hidden;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
    }

    /* header only */
    .badge.collapsed .badge-body {
      display: none;
    }

    /* minimal stays compact */
    .badge.minimal {
      width: 200px;
      max-width: 200px;
    }

    /* small (today/yesterday) */
    .badge.minimal .badge-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      justify-content: flex-start; 
    }

    /* full dashboard */
    .badge.expanded .badge-body {
      display: block;
    }

    .badge-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      gap: 8px;
      cursor: grab;
      user-select: none;
    }

    .badge-title {
      display:flex;
      align-items:center;
      gap:6px;
      font-size:13px;
      font-weight:600;
      color: #ffffff;
    }

    .badge-ident {
      display:inline-block;
      background: #75c8bbff;
      color:#000;
      font-size:10px;
      padding:2px 6px;
      border-radius:4px;
      font-weight:700;
    }

    /* Info icon for data delay disclaimer */
    .info-tip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 15px;
      height: 15px;
      border-radius: 50%;
      font-size: 9px;
      font-weight: 700;
      color: #999;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      cursor: help;
      position: relative;
      flex-shrink: 0;
    }

    .info-tip .info-tooltip {
      display: none;
      position: absolute;
      top: 22px;
      right: 0;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 11px;
      font-weight: 400;
      color: #ccc;
      line-height: 1.4;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      white-space: nowrap;
    }

    .info-tooltip-expanded {
      width: 200px;
      white-space: normal !important;
      right: auto;
      left: 0;
    }

    /* Minimal: show short, hide full */
    .badge.minimal .info-tooltip-expanded { display: none !important; }
    .badge.minimal .info-tip:hover .info-tooltip-minimal { display: block; }

    /* Expanded: show full, hide short */
    .badge.expanded .info-tooltip-minimal { display: none !important; }
    .badge.expanded .info-tip:hover .info-tooltip-expanded { display: block; }

    /* Collapsed: show short on hover */
    .badge.collapsed .info-tooltip-expanded { display: none !important; }
    .badge.collapsed .info-tip:hover .info-tooltip-minimal { display: block; }

    .info-tip:hover .info-tooltip {
      display: block;
    }

    .toggle-wrap {
      display:flex;
      align-items:center;
    }

    /* small toggle switch */
    .switch {
      position: relative;
      width: 40px;
      height: 20px;
      display:inline-block;
    }
    .switch input { display:none; }
    .slider {
      position:absolute;
      inset:0;
      background: #555;
      border-radius:20px;
      transition: background .18s;
    }
    .slider:before {
      content: "";
      position: absolute;
      left: 2px;
      top: 2px;
      width: 16px;
      height: 16px;
      background: #fff;
      border-radius: 50%;
      transition: transform .18s;
    }
    input:checked + .slider {
      background: #75c8bbff;
    }
    input:checked + .slider:before {
      transform: translateX(20px);
    }

    .badge-body {
      padding: 6px 8px;
      background: #0e0e0e;
      border-top: 1px solid #222;
      pointer-events: auto;
      position: relative;
    }

    .pv-box {
      flex: 1;
      background: #1a1a1aff;
      border: 1px solid #2a2a2a;
      border-radius: 6px;
      padding: 6px;
      text-align: center;
      cursor: default;
      transition: background 0.2s, transform 0.15s;
    }

    .pv-box:hover {
      background: #232323;
      transform: translateY(-1px);
    }

    .pv-label {
      font-size: 10px;
      opacity: 0.6;
      margin-bottom: 4px;
      letter-spacing: 0.6px;
    }

    .pv-value {
      font-size: 18px;
      font-weight: bold;
      color: #75c8bbff;
      transition: color 0.3s ease, transform 0.2s ease;
    }

    .clickable {
      cursor: pointer;
    }

    .clickable:hover {
      background: #003344;
      border-color: #75c8bbff;
    }


    .field {
      margin: 6px 0;
    }

    .field strong { display:inline-block; width: 90px; color:#dfefff; }

    #reauthenticateBtn {
      margin-top: 10px;
      padding: 6px 8px;
      border-radius: 5px;
      border: none;
      background: #ff5c5c;
      color: white;
      cursor: pointer;
      font-size: 13px;
    }

    /* dragging cursors */
    .draggable { cursor: grab; }
    .dragging { cursor: grabbing !important; }

    /* small responsive adjustments */
    @media (max-width: 480px) {
      .badge { width: 70vw; right: 6px; min-width: 200px; max-width: none; }
    }

    .badge.expanded {
      width: 45vw;
      max-width: 50vw;
      min-width: 360px;
    }

    /* ===== metrics row ===== */
    .metrics-row {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    .metric-card {
      flex: 1;
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 6px;
      padding: 6px;
      text-align: center;
    }

    .metric-label {
      font-size: 10px;
      opacity: 0.6;
      color: #ffffff;
    }

    .metric-value {
      font-size: 16px;
      font-weight: bold;
      color: #75c8bb;
    }

    /* ===== charts grid ===== */
    .charts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 6px;
    }

    .chart-card {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 6px;
      padding: 4px;
    }


    .chart-title {
      font-size: 12px;
      color: #ddd;
      margin-bottom: 4px;
      font-weight: 600;
    }

    .chart-box {
      height: 120px;
      width: 100%;
      position: relative;
    }

    .chart-box canvas {
      max-width: 100%;
    }

    /* ===== status row ===== */
    .status-row {
      font-size: 12px;
      opacity: 0.9;
      text-align: center;
    }

    /* section visibility */
    .minimal-section { display: none; }
    .expanded-section { display: none; }

    /* minimal state */
    .badge.minimal .minimal-section {
      display: flex;
      flex-direction: column;
    }

    /* expanded state */
    .badge.expanded .expanded-section {
      display: block;
    }

    .expanded-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      color: #ccc;
    }

    .expanded-title {
      font-size: 13px;
      font-weight: 600;
    }

    .expanded-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .range-label {
      font-size: 11px;
      opacity: 0.7;
    }

    /* Date preset dropdown */
    .preset-select {
      background: #1a1a1a;
      color: #ccc;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-family: Arial, Helvetica, sans-serif;
      cursor: pointer;
      outline: none;
      transition: border-color 0.15s;
    }

    .preset-select:hover,
    .preset-select:focus {
      border-color: #75c8bb;
      color: #fff;
    }

    .preset-select option {
      background: #1a1a1a;
      color: #ccc;
    }

    .collapse-btn {
      background: transparent;
      border: none;
      color: #bbb;
      font-size: 14px;
      cursor: pointer;
    }

    .collapse-btn:hover {
      color: #fff;
    }

    /* smooth content appearance */
    .expanded-section {
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }

    .badge.expanded .expanded-section {
      opacity: 1;
      transform: translateY(0);
    }

    .filter-footer {
      display: flex;
      justify-content: flex-end;
      font-size: 10px;
      color: #8a8a8a;
      margin-top: 4px;
      margin-bottom: 2px;
      padding-right: 2px;
      opacity: 0.85;
    }

    .filter-footer span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 95%;
    }

    /* Data delay disclaimer footer */
    .delay-disclaimer {
      display: flex;
      justify-content: flex-end;
      font-size: 10px;
      color: #8a8a8a;
      padding: 0 2px 4px;
      line-height: 1.3;
      opacity: 0.85;
    }

    /* ===== Accordion rows ===== */
    .accordion-row {
      border: 1px solid #2a2a2a;
      border-radius: 6px;
      margin-bottom: 6px;
      overflow: hidden;
    }

    .accordion-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: #1a1a1a;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }

    .accordion-header:hover {
      background: #222;
    }

    .accordion-title {
      font-size: 12px;
      font-weight: 600;
      color: #ccc;
    }

    .accordion-arrow {
      font-size: 10px;
      color: #888;
      transition: transform 0.2s;
    }

    .accordion-row.open .accordion-arrow {
      transform: rotate(180deg);
    }

    .accordion-content {
      display: none;
      padding: 8px;
      background: #0e0e0e;
    }

    .accordion-row.open .accordion-content {
      display: block;
    }

    /* Secondary filter dropdown inside custom report row */
    .cr-filter-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      font-size: 11px;
      color: #ccc;
      flex-wrap: nowrap;
      overflow: hidden;
    }

    .cr-primary-label {
      background: rgba(117, 200, 187, 0.12);
      border: 1px solid rgba(117, 200, 187, 0.25);
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 10px;
      color: #75c8bb;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 45%;
      flex-shrink: 1;
    }

    .cr-filter-sep {
      color: #444;
      flex-shrink: 0;
    }

    .cr-secondary-label {
      font-size: 10px;
      color: #999;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .cr-filter-bar select {
      background: #1a1a1a;
      color: #ccc;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-family: Arial, Helvetica, sans-serif;
      cursor: pointer;
      outline: none;
      max-width: 200px;
    }

    .cr-filter-bar select:hover,
    .cr-filter-bar select:focus {
      border-color: #75c8bb;
      color: #fff;
    }

    .cr-not-configured {
      font-size: 12px;
      color: #666;
      text-align: center;
      padding: 16px 8px;
    }

    /* ===== Loading overlay ===== */
    .loading-overlay {
      display: none;
      position: absolute;
      inset: 0;
      background: rgba(14, 14, 14, 0.85);
      z-index: 10;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;
      border-radius: 0 0 0 8px;
    }

    .loading-overlay.active {
      display: flex;
    }

    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #333;
      border-top-color: #75c8bb;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    .loading-text {
      font-size: 11px;
      color: #999;
      letter-spacing: 0.3px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

  `;
  shadow.appendChild(style);
  // ---------- HTML ----------
  const badge = document.createElement("div");
  badge.className = "badge collapsed";
  badge.innerHTML = `
    <div class="badge-header draggable" id="badgeHeader">
      <div class="badge-title">
        <span>Adobe Analytics Pageviews</span>
        <span class="info-tip" id="headerInfoTip">i
          <span class="info-tooltip info-tooltip-minimal">Data may be delayed ~1 hr.</span>
          <span class="info-tooltip info-tooltip-expanded">Data shown is not real-time and may have a delay of approximately 1 hour. Metrics reflect the latest available Adobe Analytics Workspace data.</span>
        </span>
      </div>
      <div class="toggle-wrap">
        <label class="switch" title="Show analytics">
          <input type="checkbox" id="expandToggle" />
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <div class="badge-body" id="badgeBody" aria-hidden="true">

      <!-- Loading overlay -->
      <div class="loading-overlay" id="loadingOverlay">
        <div class="loading-spinner"></div>
        <div class="loading-text">Fetching data…</div>
      </div>

      <!-- ================================================= -->
      <!-- MINIMAL VIEW (Today / Yesterday / More)           -->
      <!-- ================================================= -->
      <div class="minimal-section" id="minimalSection">

        <div class="pv-box" id="todayPV">
          <div class="pv-label">TODAY</div>
          <div class="pv-value" id="pageViewsToday">—</div>
        </div>

        <div class="pv-box" id="yesterdayPV">
          <div class="pv-label">YESTERDAY</div>
          <div class="pv-value" id="pageViewsYesterday">—</div>
        </div>

        <div class="pv-box clickable" id="moreBtn">
          <div class="pv-label">MORE</div>
          <div class="pv-value">⋯</div>
        </div>

      </div>


      <!-- ================================================= -->
      <!-- EXPANDED DASHBOARD VIEW                           -->
      <!-- ================================================= -->
      <div class="expanded-section" id="expandedSection">
        <div class="expanded-header">
          <span class="expanded-title">Analytics Dashboard</span>
          <div class="expanded-right">
            <span class="range-label">Date Range:</span>
            <select class="preset-select" id="datePresetSelect">
              <option value="7d">Last 7 Days</option>
              <option value="3w">Last 3 Weeks</option>
              <option value="5w">Last 5 Weeks</option>
              <option value="3m">Last 3 Months</option>
              <option value="6m">Last 6 Months</option>
            </select>
            <button id="collapseBtn" class="collapse-btn">✕</button>
          </div>
        </div>

        <!-- ===== ROW 1: Page Performance (accordion) ===== -->
        <div class="accordion-row open" id="accordionPagePerf">
          <div class="accordion-header" id="accordionPagePerfHeader">
            <span class="accordion-title">Page Performance</span>
            <span class="accordion-arrow">▼</span>
          </div>
          <div class="accordion-content">
            <div class="metrics-row">
              <div class="metric-card">
                <div class="metric-label">PAGEVIEWS</div>
                <div class="metric-value" id="metricTotalPV">—</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">VISITS</div>
                <div class="metric-value" id="metricTotalVisits">—</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">VISITORS</div>
                <div class="metric-value" id="metricTotalVisitors">—</div>
              </div>
            </div>

            <div class="charts-grid">
              <div class="chart-card">
                <div class="chart-title" id="pvChartTitle">Pageviews (7d)</div>
                <div class="chart-box"><canvas id="pvChart"></canvas></div>
              </div>
              <div class="chart-card">
                <div class="chart-title" id="visitsChartTitle">Visits (7d)</div>
                <div class="chart-box"><canvas id="visitsChart"></canvas></div>
              </div>
              <div class="chart-card">
                <div class="chart-title" id="uvChartTitle">Visitors (7d)</div>
                <div class="chart-box"><canvas id="uvChart"></canvas></div>
              </div>
              <div class="chart-card">
                <div class="chart-title">Traffic Share by Country (%)</div>
                <div class="chart-box"><canvas id="countryChart"></canvas></div>
              </div>
            </div>

            <div class="filter-footer">
              <span id="filterCondition"></span>
            </div>
          </div>
        </div>

        <!-- ===== ROW 2: Custom Report (accordion, hidden if not configured) ===== -->
        <div class="accordion-row" id="accordionCustomReport" style="display:none;">
          <div class="accordion-header" id="accordionCustomReportHeader">
            <span class="accordion-title">Custom Report</span>
            <span class="accordion-arrow">▼</span>
          </div>
          <div class="accordion-content">
            <!-- Combined filter bar: primary label + secondary dropdown in one row -->
            <div class="cr-filter-bar" id="crFilterBar">
              <span class="cr-primary-label" id="crPrimaryLabel"></span>
              <span class="cr-filter-sep">|</span>
              <span class="cr-secondary-label" id="crSecondaryLabel"></span>
              <select id="crSecondarySelect">
                <option value="">No Filter</option>
              </select>
            </div>

            <div class="metrics-row">
              <div class="metric-card">
                <div class="metric-label">PAGEVIEWS</div>
                <div class="metric-value" id="crMetricPV">—</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">VISITS</div>
                <div class="metric-value" id="crMetricVisits">—</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">VISITORS</div>
                <div class="metric-value" id="crMetricVisitors">—</div>
              </div>
            </div>

            <div class="charts-grid">
              <div class="chart-card">
                <div class="chart-title" id="crPvChartTitle">Pageviews (7d)</div>
                <div class="chart-box"><canvas id="crPvChart"></canvas></div>
              </div>
              <div class="chart-card">
                <div class="chart-title" id="crVisitsChartTitle">Visits (7d)</div>
                <div class="chart-box"><canvas id="crVisitsChart"></canvas></div>
              </div>
              <div class="chart-card">
                <div class="chart-title" id="crUvChartTitle">Visitors (7d)</div>
                <div class="chart-box"><canvas id="crUvChart"></canvas></div>
              </div>
              <div class="chart-card">
                <div class="chart-title">Traffic Share by Country (%)</div>
                <div class="chart-box"><canvas id="crCountryChart"></canvas></div>
              </div>
            </div>

          </div>
        </div>

        <div class="delay-disclaimer">
          <span>Data is not real-time and may have a delay of ~1 hour.</span>
        </div>

      </div>


      <!-- ===== STATUS + AUTH (shared) ===== -->
      <div class="status-row">
        <span id="status">Checking token…</span>
        <button id="reauthenticateBtn" hidden>Reauthenticate</button>
      </div>
    </div>
  `;
  shadow.appendChild(badge);

  // expose easy refs
  const header = shadow.getElementById("badgeHeader");
  const toggle = shadow.getElementById("expandToggle");
  const body = shadow.getElementById("badgeBody");
  const statusEl = shadow.getElementById("status");
  const reauthBtn = shadow.getElementById("reauthenticateBtn");
  const moreBtn = shadow.getElementById("moreBtn");
  const collapseBtn = shadow.getElementById("collapseBtn");
  const datePresetSelect = shadow.getElementById("datePresetSelect");
  const loadingOverlay = shadow.getElementById("loadingOverlay");

  // Accordion refs
  const accordionPagePerf = shadow.getElementById("accordionPagePerf");
  const accordionPagePerfHeader = shadow.getElementById("accordionPagePerfHeader");
  const accordionCustomReport = shadow.getElementById("accordionCustomReport");
  const accordionCustomReportHeader = shadow.getElementById("accordionCustomReportHeader");
  const crSecondarySelect = shadow.getElementById("crSecondarySelect");

  // Custom report chart instances (separate from page perf)
  let crChartInstances = {};
  let customReportConfig = null;
  let crSecondaryValues = [];

  function showLoading() {
    if (loadingOverlay) loadingOverlay.classList.add("active");
  }

  function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.remove("active");
  }

  // Set saved preset in dropdown
  datePresetSelect.value = currentDatePreset;

  //If badge position saved in sessionStorage, apply it
  const savedLeft = sessionStorage.getItem("badgeLeftPosition");
  const savedTop = sessionStorage.getItem("badgeTopPosition");
  if (savedLeft && savedTop) {
    badge.style.left = savedLeft;
    badge.style.top = savedTop;
    badge.style.position = "fixed";
    badge.style.right = "auto";
  }

  //Initial toggle state from sessionStorage
  const toggleState = sessionStorage.getItem("adobePVExtensionToggle");
  const viewMode = sessionStorage.getItem("adobePVExtensionViewMode"); // "minimal" or "expanded"
  if (toggleState === "enabled") {
    toggle.checked = true;
    body.setAttribute("aria-hidden", "false");
    if (viewMode === "expanded" && isDesktop()) {
      badge.classList.remove("collapsed", "minimal");
      badge.classList.add("expanded");
      showLoading();
      // Fetch data and render expanded view
      setTimeout(async () => {
        await fetchPageData();
        let resp = await checkToken();
        if (resp) {
          const pageData = await getPageData(currentDatePreset);
          const countryData = await getCountryData(currentDatePreset);
          hideLoading();
          updateChartTitles();
          renderCharts(pageData, countryData);
          updateFilterCondition();
          await loadCustomReportAccordion();
        } else {
          hideLoading();
        }
      }, 2000);
    } else {
      badge.classList.remove("collapsed", "expanded");
      badge.classList.add("minimal");
      showLoading();
      setTimeout(fetchPageData, 2000);
    }
  } else {
    toggle.checked = false;
    badge.classList.remove("minimal", "expanded");
    badge.classList.add("collapsed");
    body.setAttribute("aria-hidden", "true");
  }

  // ---------- toggle behavior ----------
  toggle.addEventListener("change", async () => {
    if (toggle.checked) {
      badge.classList.remove("collapsed", "expanded");
      badge.classList.add("minimal");
      sessionStorage.setItem("adobePVExtensionToggle", "enabled");
      sessionStorage.setItem("adobePVExtensionViewMode", "minimal");
      body.setAttribute("aria-hidden", "false");
      showLoading();
      await fetchPageData();
      hideLoading();
    } else {
      badge.classList.remove("minimal", "expanded");
      badge.classList.add("collapsed");
      sessionStorage.setItem("adobePVExtensionToggle", "disabled");
      sessionStorage.removeItem("adobePVExtensionViewMode");
      body.setAttribute("aria-hidden", "true");
    }
  });

  /* ---------- MORE → expanded ---------- */
  moreBtn.addEventListener("click", async () => {
    if (!isDesktop()) {
      statusEl.textContent = "Expanded charts available on desktop only";
      return;
    }

    // minimal → expanded
    badge.classList.remove("minimal");
    badge.classList.add("expanded");
    sessionStorage.setItem("adobePVExtensionViewMode", "expanded");
    showLoading();
    let resp = await checkToken();
    if (!resp) { hideLoading(); return; }
    const pageData = await getPageData(currentDatePreset);
    const countryData = await getCountryData(currentDatePreset);
    hideLoading();

    updateChartTitles();
    renderCharts(pageData, countryData);
    updateFilterCondition();

    // Load custom report config and show/hide row 2
    await loadCustomReportAccordion();
  });

  /* ---------- collapse → minimal ---------- */
  collapseBtn.addEventListener("click", () => {
    badge.classList.remove("expanded");
    badge.classList.add("minimal");
    sessionStorage.setItem("adobePVExtensionViewMode", "minimal");
    Object.values(chartInstances).forEach((c) => c?.destroy());
    chartInstances = {};
    Object.values(crChartInstances).forEach((c) => c?.destroy());
    crChartInstances = {};
  });

  /* ---------- Accordion Toggle ---------- */
  accordionPagePerfHeader.addEventListener("click", () => {
    const isOpen = accordionPagePerf.classList.contains("open");
    if (isOpen) {
      accordionPagePerf.classList.remove("open");
    } else {
      accordionPagePerf.classList.add("open");
      accordionCustomReport.classList.remove("open");
    }
  });

  accordionCustomReportHeader.addEventListener("click", async () => {
    const isOpen = accordionCustomReport.classList.contains("open");
    if (isOpen) {
      accordionCustomReport.classList.remove("open");
    } else {
      accordionCustomReport.classList.add("open");
      accordionPagePerf.classList.remove("open");
      // Fetch custom report data when opening for the first time
      await fetchAndRenderCustomReport();
    }
  });

  /* ---------- Secondary dimension filter change ---------- */
  crSecondarySelect.addEventListener("change", async () => {
    await fetchAndRenderCustomReport();
  });

  /* ---------- Date Preset Change ---------- */
  datePresetSelect.addEventListener("change", async (e) => {
    currentDatePreset = e.target.value;
    await saveDatePreset(currentDatePreset);

    // Re-fetch expanded view data with new preset
    showLoading();
    statusEl.textContent = "";
    let resp = await checkToken();
    if (!resp) { hideLoading(); return; }

    const pageData = await getPageData(currentDatePreset);
    const countryData = await getCountryData(currentDatePreset);

    if (!pageData || !countryData) {
      hideLoading();
      statusEl.textContent = "No data available for this page.";
      return;
    }
    hideLoading();
    statusEl.textContent = "";

    // Update summary metrics from new preset data
    renderMetrics(pageData);
    updateChartTitles();
    renderCharts(pageData, countryData);
    updateFilterCondition();

    // Also refresh custom report if it's open
    if (accordionCustomReport.classList.contains("open")) {
      await fetchAndRenderCustomReport();
    }
  });

  // ---------- dragging (mouse + touch) ----------
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const startDrag = (clientX, clientY) => {
    dragging = true;
    badge.classList.add("dragging");
    const rect = badge.getBoundingClientRect();
    dragOffsetX = clientX - rect.left;
    dragOffsetY = clientY - rect.top;
    badge.style.left = rect.left + "px";
    badge.style.top = rect.top + "px";
    badge.style.right = "auto";
    badge.style.position = "fixed";
  };

  const doDrag = (clientX, clientY) => {
    if (!dragging) return;
    const newLeft = clientX - dragOffsetX;
    const newTop = clientY - dragOffsetY;
    const maxLeft = window.innerWidth - 40;
    const maxTop = window.innerHeight - 40;
    badge.style.left = Math.min(Math.max(0, newLeft), maxLeft) + "px";
    badge.style.top = Math.min(Math.max(0, newTop), maxTop) + "px";
  };

  const stopDrag = async () => {
    dragging = false;
    badge.classList.remove("dragging");
    sessionStorage.setItem("badgeLeftPosition", badge.style.left);
    sessionStorage.setItem("badgeTopPosition", badge.style.top);
  };

  // mouse events
  header.addEventListener("mousedown", (ev) => {
    if (ev.target.closest("label.switch")) return;
    ev.preventDefault();
    startDrag(ev.clientX, ev.clientY);
  });
  document.addEventListener("mousemove", (ev) => doDrag(ev.clientX, ev.clientY));
  document.addEventListener("mouseup", stopDrag);

  // touch events
  header.addEventListener(
    "touchstart",
    (ev) => {
      const touch = ev.touches[0];
      if (!touch) return;
      startDrag(touch.clientX, touch.clientY);
    },
    { passive: false },
  );
  document.addEventListener(
    "touchmove",
    (ev) => {
      const touch = ev.touches[0];
      if (!touch) return;
      doDrag(touch.clientX, touch.clientY);
    },
    { passive: false },
  );
  document.addEventListener("touchend", stopDrag);

  // ---------- reauthBtn Click handler ----------
  reauthBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "OPEN_EXTENSION_OPTION" }, (response) => {
      if (chrome.runtime.lastError) {
        return;
      }
    });
  });

  // ---------- Checking Token validity ----------
  async function checkToken() {
    const isTokenValid = await checkTokenValidity();
    if (isTokenValid) {
      statusEl.textContent = "";
      reauthBtn.hidden = true;
    } else {
      hideLoading();
      statusEl.textContent = "Token is invalid or expired.";
      reauthBtn.hidden = false;
    }
    return isTokenValid;
  }

  async function checkTokenValidity() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "GET_TOKEN_VALIDITY" }, (response) => {
        if (response && response.success) {
          resolve(true);
        } else {
          resolve(false);
        }
        if (chrome.runtime.lastError) {
          return;
        }
      });
    });
  }

  async function fetchPageData() {
    let pageIdentifierResp = await fetchPageIdentifiers();
    if (pageIdentifierResp.success === false) {
      //Try again after 2 seconds
      setTimeout(() => {
        fetchPageData();
      }, 2000);
      return;
    } else if (pageIdentifierResp?.success === true) {
      await updateWidgetWithPageData();
    }
  }

  async function fetchPageIdentifiers() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "GET_PAGE_IDENTIFIERS" }, (response) => {
        if (response.pageIdentifier && response.success) {
          pageIdentifier = response.pageIdentifier;
          if (pageIdentifier.source == "url") {
            pageIdentifier.value = window.location.href;
            resolve({ success: true, pageIdentifier: pageIdentifier });
          } else if (pageIdentifier.source == "title") {
            pageIdentifier.value = document.title;
            resolve({ success: true, pageIdentifier: pageIdentifier });
          } else if (pageIdentifier.source == "window") {
            window.dispatchEvent(new CustomEvent("fetchPageWindowPathIdentifiers", { detail: pageIdentifier }));
            resolve({});
          }
        } else {
          resolve({ success: false, pageIdentifier: {} });
        }
        return true;
      });
    });
  }

  async function updateWidgetWithPageData() {
    let resp = await checkToken();
    if (!resp) return;
    showLoading();
    statusEl.textContent = "";

    // Minimal view always uses "7d" preset for today/yesterday
    const [pageData, countryData] = await Promise.all([getPageData("7d"), getCountryData("7d")]);
    if (!pageData || !countryData) {
      hideLoading();
      statusEl.textContent = "No data available for this page.";
      return;
    }
    hideLoading();
    statusEl.textContent = "";
    renderMetrics(pageData);
    updateFilterCondition();
    return;
  }
  window.updateWidgetWithPageData = updateWidgetWithPageData;

  // =====================
  // SPA Re-fetch Handler
  // =====================
  async function refetchPageDataForSpa() {
    // Re-read page identifier based on current source
    let pageIdentifierResp = await fetchPageIdentifiers();
    if (pageIdentifierResp.success === true) {
      // For url/title sources, update immediately
      await updateWidgetWithPageData();

      // If expanded view is active, also refresh charts
      if (badge.classList.contains("expanded")) {
        showLoading();
        const pageData = await getPageData(currentDatePreset);
        const countryData = await getCountryData(currentDatePreset);
        hideLoading();
        if (pageData && countryData) {
          renderMetrics(pageData);
          renderCharts(pageData, countryData);
          updateFilterCondition();
        }
        // Also refresh custom report if open
        if (accordionCustomReport.classList.contains("open")) {
          await fetchAndRenderCustomReport();
        }
      }
    }
    // For 'window' source, the pageIdentifierWindowPathValue event listener handles the update
  }
  window.refetchPageDataForSpa = refetchPageDataForSpa;

  function renderMetrics(pageData) {
    if (!pageData) return;

    const pageViews = pageData.pageViews || [];

    const totalPV = pageData.filteredTotals[0] || [];
    const totalVisits = pageData.filteredTotals[1] || [];
    const totalVisitors = pageData.filteredTotals[2] || [];

    const todayPV = pageViews[pageViews.length - 1] || 0;
    const yesterdayPV = pageViews[pageViews.length - 2] || 0;
    const pvEl = badge.querySelector("#metricTotalPV");
    const visitsEl = badge.querySelector("#metricTotalVisits");
    const uvEl = badge.querySelector("#metricTotalVisitors");
    const todayEl = badge.querySelector("#pageViewsToday");
    const yesterdayEl = badge.querySelector("#pageViewsYesterday");

    pvEl.textContent = formatLargeNumber(totalPV);
    visitsEl.textContent = formatLargeNumber(totalVisits);
    uvEl.textContent = formatLargeNumber(totalVisitors);
    todayEl.textContent = formatLargeNumber(todayPV);
    yesterdayEl.textContent = formatLargeNumber(yesterdayPV);
  }

  function updateChartTitles() {
    const presetLabel = DATE_PRESET_LABELS[currentDatePreset] || "Last 7 Days";
    const shortLabels = { "7d": "7d", "3w": "3w", "5w": "5w", "3m": "3m", "6m": "6m" };
    const shortLabel = shortLabels[currentDatePreset] || "7d";
    const pvTitle = badge.querySelector("#pvChartTitle");
    const visitsTitle = badge.querySelector("#visitsChartTitle");
    const uvTitle = badge.querySelector("#uvChartTitle");
    if (pvTitle) pvTitle.textContent = `Pageviews (${shortLabel})`;
    if (visitsTitle) visitsTitle.textContent = `Visits (${shortLabel})`;
    if (uvTitle) uvTitle.textContent = `Visitors (${shortLabel})`;
  }

  function formatChartLabel(rawLabel, granularity) {
    // For daily: "Jan 15, 2025" → "Jan 15"
    // For weekly: "Jan 13, 2025 ~ Jan 19, 2025" → "Jan 13-19"
    // For monthly: "Jan 2025" → "Jan" or "January 2025" → "Jan '25"
    if (granularity === "month") {
      // Adobe returns month labels like "January 2025" or "Jan 2025"
      const parts = rawLabel.trim().split(/\s+/);
      if (parts.length >= 2) {
        const monthShort = parts[0].substring(0, 3);
        const yearShort = "'" + parts[parts.length - 1].slice(-2);
        return `${monthShort} ${yearShort}`;
      }
      return rawLabel;
    }
    if (granularity === "week") {
      // Adobe returns week ranges like "Jan 13, 2025 ~ Jan 19, 2025"
      const parts = rawLabel.split("~").map((s) => s.trim());
      if (parts.length === 2) {
        const startParts = parts[0].split(",")[0].trim(); // "Jan 13"
        const endDate = parts[1].split(",")[0].trim().split(" "); // ["Jan", "19"]
        const endDay = endDate[endDate.length - 1]; // "19"
        return `${startParts}-${endDay}`;
      }
      return rawLabel.split(",")[0];
    }
    // Daily: just remove the year
    return rawLabel.split(",")[0];
  }

  function createVerticalChart(canvas, labels, values, granularity, store) {
    if (!canvas) return;
    const instanceStore = store || chartInstances;
    const ctx = canvas.getContext("2d");
    if (instanceStore[canvas.id]) {
      instanceStore[canvas.id].destroy();
    }

    const formattedLabels = labels.map((l) => formatChartLabel(l, granularity));

    instanceStore[canvas.id] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: formattedLabels,
        datasets: [
          {
            data: values,
            backgroundColor: "#75c8bb",
            borderColor: "#75c8bb",
            borderWidth: 0,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,

        layout: {
          padding: {
            top: 5,
            right: 5,
            bottom: 0,
            left: 0,
          },
        },

        interaction: {
          mode: "index",
        },

        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "#1f1f1f",
            borderColor: "#75c8bb",
            borderWidth: 1,
            titleColor: "#fff",
            bodyColor: "#fff",
            titleFont: { size: 11 },
            bodyFont: { size: 11, weight: "bold" },
            padding: 6,
            displayColors: false,
            callbacks: {
              title: function (context) {
                // Show the original full label in tooltip
                const idx = context[0].dataIndex;
                return labels[idx] || context[0].label;
              },
              label: function (context) {
                return context.parsed.y.toLocaleString();
              },
            },
          },
        },

        scales: {
          x: {
            grid: {
              display: false,
            },
            ticks: {
              color: "#ddd",
              font: {
                size: 8,
              },
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: "#333",
            },
            ticks: {
              color: "#ddd",
              font: {
                size: 9,
              },
            },
          },
        },
      },
    });
  }

  function createHorizontalChart(canvas, labels, values, store) {
    if (!canvas) return;
    const instanceStore = store || chartInstances;
    const ctx = canvas.getContext("2d");
    if (instanceStore[canvas.id]) {
      instanceStore[canvas.id].destroy();
    }

    instanceStore[canvas.id] = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: "#75c8bb",
            borderColor: "#75c8bb",
            borderWidth: 0,
            barPercentage: 0.6,
            categoryPercentage: 0.8,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,

        layout: {
          padding: {
            top: 5,
            right: 10,
            bottom: 0,
            left: 0,
          },
        },

        interaction: {
          mode: "index",
        },

        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "#1f1f1f",
            borderColor: "#75c8bb",
            borderWidth: 1,
            titleColor: "#fff",
            bodyColor: "#fff",
            titleFont: { size: 11 },
            bodyFont: { size: 11, weight: "bold" },
            padding: 6,
            displayColors: false,
            callbacks: {
              title: function (context) {
                return context[0].label;
              },
              label: function (context) {
                return context.parsed.x + "%";
              },
            },
          },
        },

        scales: {
          x: {
            beginAtZero: true,
            grid: {
              color: "#333",
            },
            ticks: {
              color: "#ddd",
              font: {
                size: 8,
              },
              callback: (v) => v + "%",
            },
          },
          y: {
            grid: {
              display: false,
            },
            ticks: {
              color: "#ddd",
              font: {
                size: 9,
              },
            },
          },
        },
      },
    });
  }

  function renderCharts(pageData, countryData) {
    if (!pageData || !countryData) return;

    const root = badge;
    const granularity = pageData.granularity || "day";

    createVerticalChart(root.querySelector("#pvChart"), pageData.dates, pageData.pageViews, granularity);

    createVerticalChart(root.querySelector("#visitsChart"), pageData.dates, pageData.visits, granularity);

    createVerticalChart(root.querySelector("#uvChart"), pageData.dates, pageData.visitors, granularity);

    createHorizontalChart(root.querySelector("#countryChart"), countryData.countries, countryData.pageViews);
  }

  async function updateFilterCondition() {
    const el = badge.querySelector("#filterCondition");
    if (!el) return;

    const { pageIdentifierCondition } = await chrome.storage.local.get("pageIdentifierCondition");

    if (!pageIdentifierCondition) {
      el.textContent = "";
      return;
    }

    el.textContent = `Filter: ${pageIdentifierCondition}`;
    el.title = pageIdentifierCondition;
  }

  // =============================================
  // CUSTOM REPORT FUNCTIONS
  // =============================================

  async function loadCustomReportAccordion() {
    const { customReportConfig: config } = await chrome.storage.local.get("customReportConfig");
    customReportConfig = config;

    if (!config || !config.enabled || !config.primaryDimension?.id || !config.primaryValue) {
      accordionCustomReport.style.display = "none";
      return;
    }

    accordionCustomReport.style.display = "block";

    // Set primary filter label
    const primaryLabel = badge.querySelector("#crPrimaryLabel");
    if (primaryLabel) {
      primaryLabel.textContent = `${config.primaryDimension.displayLabel} ${config.primaryMatch} '${config.primaryValue}'`;
      primaryLabel.title = primaryLabel.textContent;
    }

    // Set secondary label and dropdown visibility
    const secondaryLabel = badge.querySelector("#crSecondaryLabel");
    const filterSep = badge.querySelector(".cr-filter-sep");
    if (config.secondaryDimension?.id) {
      // Build label like "Prop3 - Platform"
      const secDisplay = config.secondaryDimension.displayLabel || config.secondaryDimension.id;
      if (secondaryLabel) secondaryLabel.textContent = `${secDisplay}:`;
      if (filterSep) filterSep.style.display = "inline";
      crSecondarySelect.style.display = "inline-block";
      populateSecondaryDropdown();
    } else {
      // No secondary configured — hide secondary elements
      if (secondaryLabel) secondaryLabel.textContent = "";
      if (filterSep) filterSep.style.display = "none";
      crSecondarySelect.style.display = "none";
    }
  }

  async function populateSecondaryDropdown() {
    const { secondaryDimensionValues } = await chrome.storage.local.get("secondaryDimensionValues");
    crSecondarySelect.innerHTML = "";

    // "No Filter" option
    const noFilterOpt = document.createElement("option");
    noFilterOpt.value = "";
    noFilterOpt.textContent = "No Filter";
    crSecondarySelect.appendChild(noFilterOpt);

    if (secondaryDimensionValues) {
      try {
        crSecondaryValues = JSON.parse(secondaryDimensionValues);
        crSecondaryValues.forEach((v) => {
          const opt = document.createElement("option");
          opt.value = v.value;
          opt.textContent = v.value;
          crSecondarySelect.appendChild(opt);
        });
      } catch (e) {
        crSecondaryValues = [];
      }
    }
  }

  async function fetchAndRenderCustomReport() {
    if (!customReportConfig || !customReportConfig.enabled) return;

    showLoading();
    let resp = await checkToken();
    if (!resp) { hideLoading(); return; }

    const customFilters = {
      primaryDimension: customReportConfig.primaryDimension.id,
      primaryMatch: customReportConfig.primaryMatch || "exact",
      primaryValue: customReportConfig.primaryValue,
    };

    // Add secondary filter if selected
    const secondaryValue = crSecondarySelect.value;
    if (secondaryValue && customReportConfig.secondaryDimension?.id) {
      customFilters.secondaryDimension = customReportConfig.secondaryDimension.id;
      customFilters.secondaryValue = secondaryValue;
    }

    const [crPageData, crCountryData] = await Promise.all([
      getCustomReportData("pageViews", currentDatePreset, customFilters),
      getCustomReportData("countryData", currentDatePreset, customFilters),
    ]);
    hideLoading();

    renderCustomReportMetrics(crPageData);
    renderCustomReportCharts(crPageData, crCountryData);
    updateCustomReportFilterCondition(customFilters);
    updateCrChartTitles();
  }

  function renderCustomReportMetrics(pageData) {
    const pvEl = badge.querySelector("#crMetricPV");
    const visitsEl = badge.querySelector("#crMetricVisits");
    const uvEl = badge.querySelector("#crMetricVisitors");

    if (!pageData) {
      if (pvEl) pvEl.textContent = "0";
      if (visitsEl) visitsEl.textContent = "0";
      if (uvEl) uvEl.textContent = "0";
      return;
    }

    const totalPV = pageData.filteredTotals?.[0] || 0;
    const totalVisits = pageData.filteredTotals?.[1] || 0;
    const totalVisitors = pageData.filteredTotals?.[2] || 0;

    if (pvEl) pvEl.textContent = formatLargeNumber(totalPV);
    if (visitsEl) visitsEl.textContent = formatLargeNumber(totalVisits);
    if (uvEl) uvEl.textContent = formatLargeNumber(totalVisitors);
  }

  function renderCustomReportCharts(pageData, countryData) {
    const root = badge;
    const granularity = pageData?.granularity || "day";

    // Destroy existing CR charts
    Object.values(crChartInstances).forEach((c) => c?.destroy());
    crChartInstances = {};

    if (pageData) {
      createVerticalChart(root.querySelector("#crPvChart"), pageData.dates, pageData.pageViews, granularity, crChartInstances);
      createVerticalChart(root.querySelector("#crVisitsChart"), pageData.dates, pageData.visits, granularity, crChartInstances);
      createVerticalChart(root.querySelector("#crUvChart"), pageData.dates, pageData.visitors, granularity, crChartInstances);
    }

    if (countryData) {
      createHorizontalChart(root.querySelector("#crCountryChart"), countryData.countries, countryData.pageViews, crChartInstances);
    }
  }

  function updateCrChartTitles() {
    const shortLabels = { "7d": "7d", "3w": "3w", "5w": "5w", "3m": "3m", "6m": "6m" };
    const shortLabel = shortLabels[currentDatePreset] || "7d";
    const pvTitle = badge.querySelector("#crPvChartTitle");
    const visitsTitle = badge.querySelector("#crVisitsChartTitle");
    const uvTitle = badge.querySelector("#crUvChartTitle");
    if (pvTitle) pvTitle.textContent = `Pageviews (${shortLabel})`;
    if (visitsTitle) visitsTitle.textContent = `Visits (${shortLabel})`;
    if (uvTitle) uvTitle.textContent = `Visitors (${shortLabel})`;
  }

  function updateCustomReportFilterCondition(customFilters) {
    // No-op: filter conditions are now displayed in the filter bar at the top
    // Primary label is set in loadCustomReportAccordion
    // Secondary is handled by the dropdown
  }
}

function getPageData(datePreset = "7d") {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "GET_REPORT", pageIdentifier: pageIdentifier, reportType: "pageViews", datePreset: datePreset }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      if (response.success) {
        response.reportData.dates = response.reportData.dates.map((dt) => dt.split(",")[0]);
        resolve(response.reportData);
      } else {
        resolve(null);
      }
    });
  });
}

function getCountryData(datePreset = "7d") {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "GET_REPORT", pageIdentifier: pageIdentifier, reportType: "countryData", datePreset: datePreset }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      if (response.success) {
        resolve(response.reportData);
      } else {
        resolve(null);
      }
    });
  });
}

function getCustomReportData(reportType = "pageViews", datePreset = "7d", customFilters = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "GET_CUSTOM_REPORT",
        pageIdentifier: pageIdentifier,
        reportType: reportType,
        datePreset: datePreset,
        customFilters: customFilters,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        if (response && response.success) {
          if (reportType === "pageViews" && response.reportData?.dates) {
            response.reportData.dates = response.reportData.dates.map((dt) => dt.split(",")[0]);
          }
          resolve(response.reportData);
        } else {
          resolve(null);
        }
      },
    );
  });
}

async function getEnableOnPageFlag() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "GET_ENABLED_ON_PAGE_FLAG" }, (response) => {
      if (response && typeof response.isEnabled === "boolean") {
        resolve(response.isEnabled);
      } else {
        resolve(false);
      }
      if (chrome.runtime.lastError) {
        return;
      }
    });
  });
}

function isDesktop() {
  return window.innerWidth >= 900;
}

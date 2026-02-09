let widgetData = {};
let badgeElem = null;
let adobeAnalyticsImplemented = null;
let extCustomTimerID = null;
let pageIdentifier = {};
let chartInstances = {};

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

function delay(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
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
      flex-direction: column;   /* ✅ stack vertically */
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
      gap:8px;
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
      margin-bottom: 6px;
      padding-right: 2px;
      opacity: 0.85;
    }

    .filter-footer span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 95%;
    }

  `;
  shadow.appendChild(style);
  // ---------- HTML ----------
  const badge = document.createElement("div");
  badge.className = "badge collapsed";
  badge.innerHTML = `
    <div class="badge-header draggable" id="badgeHeader">
      <div class="badge-title">
       <!-- <span class="badge-ident">Extension</span> -->
        <span>Adobe Analytics Pageviews</span>
      </div>
      <div class="toggle-wrap">
        <label class="switch" title="Show analytics">
          <input type="checkbox" id="expandToggle" />
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <div class="badge-body" id="badgeBody" aria-hidden="true">

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
          <span class="expanded-title">Page Performance</span>
          <div class="expanded-right">
            <span class="range-label">Last 7 Days</span>
            <button id="collapseBtn" class="collapse-btn">✕</button>
          </div>
        </div>
        
        <!-- ===== SUMMARY METRICS ===== -->
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

        <!-- ===== CHARTS ===== -->
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-title">Pageviews (7d)</div>
            <div class="chart-box"><canvas id="pvChart"></canvas></div>
          </div>

          <div class="chart-card">
            <div class="chart-title">Visits (7d)</div>
            <div class="chart-box"><canvas id="visitsChart"></canvas></div>
          </div>

          <div class="chart-card">
            <div class="chart-title">Visitors (7d)</div>
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
  if (toggleState === "enabled") {
    toggle.checked = true;
    badge.classList.remove("collapsed", "expanded");
    badge.classList.add("minimal");
    body.setAttribute("aria-hidden", "false");
    setTimeout(fetchPageData, 2000);
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
      body.setAttribute("aria-hidden", "false");
      await fetchPageData();
    } else {
      badge.classList.remove("minimal", "expanded");
      badge.classList.add("collapsed");
      sessionStorage.setItem("adobePVExtensionToggle", "disabled");
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
    // wait until DOM is visible
    // await new Promise((r) => setTimeout(r, 2000));
    // await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let resp = await checkToken();
    if (!resp) return;
    const pageData = await getPageData();
    const countryData = await getCountryData();

    renderCharts(pageData, countryData);
    updateFilterCondition();
  });

  /* ---------- collapse → minimal ---------- */
  collapseBtn.addEventListener("click", () => {
    badge.classList.remove("expanded");
    badge.classList.add("minimal");
    Object.values(chartInstances).forEach((c) => c?.destroy());
    chartInstances = {};
  });

  // ---------- dragging (mouse + touch) ----------
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const startDrag = (clientX, clientY) => {
    dragging = true;
    badge.classList.add("dragging");
    // compute offset relative to top-left of badge
    const rect = badge.getBoundingClientRect();
    dragOffsetX = clientX - rect.left;
    dragOffsetY = clientY - rect.top;
    // switch to absolute positioning if not already
    badge.style.left = rect.left + "px";
    badge.style.top = rect.top + "px";
    badge.style.right = "auto";
    badge.style.position = "fixed";
  };

  const doDrag = (clientX, clientY) => {
    if (!dragging) return;
    const newLeft = clientX - dragOffsetX;
    const newTop = clientY - dragOffsetY;
    // clamp so it stays visible
    const maxLeft = window.innerWidth - 40; // minimal allowance
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
    // don't start drag if clicking the toggle itself
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
    let pageIdentifier = await fetchPageIdentifiers();
    if (pageIdentifier.success === false) {
      //Try again after 2 seconds
      setTimeout(() => {
        fetchPageData();
      }, 2000);
      return;
    } else if (pageIdentifier?.success === true) {
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
    statusEl.textContent = "Fetching Data...";
    const [pageData, countryData] = await Promise.all([getPageData(), getCountryData()]);
    if (!pageData || !countryData) {
      statusEl.textContent = "No data available for this page.";
      return;
    }
    statusEl.textContent = "";
    renderMetrics(pageData);
    return;
  }
  window.updateWidgetWithPageData = updateWidgetWithPageData;

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

    pvEl.textContent = totalPV.toLocaleString();
    visitsEl.textContent = totalVisits.toLocaleString();
    uvEl.textContent = totalVisitors.toLocaleString();
    todayEl.textContent = todayPV.toLocaleString();
    yesterdayEl.textContent = yesterdayPV.toLocaleString();
  }

  function createVerticalChart(canvas, labels, values) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (chartInstances[canvas.id]) {
      chartInstances[canvas.id].destroy();
    }

    chartInstances[canvas.id] = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
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

        // Disable all interactions
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
                return context.parsed.y;
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

  function createHorizontalChart(canvas, labels, values) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (chartInstances[canvas.id]) {
      chartInstances[canvas.id].destroy();
    }

    chartInstances[canvas.id] = new Chart(ctx, {
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
        indexAxis: "y", // THIS MAKES IT HORIZONTAL!
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

        // Disable all interactions
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

    createVerticalChart(root.querySelector("#pvChart"), pageData.dates, pageData.pageViews);

    createVerticalChart(root.querySelector("#visitsChart"), pageData.dates, pageData.visits);

    createVerticalChart(root.querySelector("#uvChart"), pageData.dates, pageData.visitors);

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
    el.title = pageIdentifierCondition; // tooltip if long
  }
}

function getPageData() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "GET_REPORT", pageIdentifier: pageIdentifier, reportType: "pageViews" }, (response) => {
      console.log("EX] Page Data Response:", response);
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

function getCountryData() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "GET_REPORT", pageIdentifier: pageIdentifier, reportType: "countryData" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      if (response.success) {
        console.log("[EX] Country Data Response:", response);
        resolve(response.reportData);
      } else {
        resolve(null);
      }
    });
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
  return window.innerWidth >= 900; // laptop/desktop threshold
}

let widgetData = {};
let pageIdentifier = [];
let badgeElem = null;
let adobeAnalyticsImplemented = null;
let extCustomTimerID = null;

//Injecting script to the page
window.addEventListener("load", () => {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("getPageIdentifiers.js");
  (document.head || document.documentElement).appendChild(script);
  script.onload = function () {
    // this.remove();
    window.dispatchEvent(new CustomEvent("fetchPageIdentifiers"));
  };
});

window.addEventListener("load", async () => {
  // ---------- Checking if widget is enable ----------
  const isWidgetEnabled = await getEnableOnPageFlag();
  if (isWidgetEnabled == false) return;
  //Get page identifiers from injected script
  await delay(1); // wait for 1 second to get the identifiers
  window.dispatchEvent(new CustomEvent("fetchPageIdentifiers"));
  window.dispatchEvent(new CustomEvent("isAdobeAnalyticsImplemented"));
  loadWidgetOnThePage();
});

window.addEventListener("pageIdentifiersResponse", (e) => {
  if (!e.detail.pageIdentifier || e.detail.pageIdentifier.length == 0) return;
  pageIdentifier = e.detail.pageIdentifier;
});

window.addEventListener("isAdobeAnalyticsImplementedResponse", (e) => {
  if (e.detail.adobeAnalyticsImplemented) adobeAnalyticsImplemented = true;
  else adobeAnalyticsImplemented = false;
});

function delay(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function loadWidgetOnThePage() {
  //load widget only if Adobe Analytics is implemented on the page
  if (adobeAnalyticsImplemented === null) {
    setTimeout(loadWidgetOnThePage, 1000);
    return;
  }
  if (adobeAnalyticsImplemented == false) return;
  keepBackgroundAwake();
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
      width: 30vw;
      max-width: 260px;
      min-width: 140px;
      background: rgba(17,17,17,0.96);
      color: #fff;
      border-left: 3px solid #75c8bbff;
      border-radius: 8px 0 0 8px;
      box-shadow: -4px 4px 18px rgba(0,0,0,0.5);
      transition: height 0.28s ease, width 0.2s ease;
      pointer-events: auto;
      font-family: Arial, Helvetica, sans-serif;
      overflow: visible;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
    }

    

    /* collapsed: hide body */
    .badge.collapsed .badge-body {
      display: none;
    }

    

    /* expanded: show body automatically */
    .badge.expanded .badge-body {
      display: flex;
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
      color:#ffffff;
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
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      padding: 8px 10px;
      background: #0e0e0e;
      border-top: 1px solid #222;
      pointer-events: auto;
      box-sizing: border-box;
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

    .badge.expanded .badge-body {
      display: block;
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
      .badge { width: 70vw; right: 6px; min-width: 120px; max-width: none; }
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
      <div class="pv-box" id="todayPV">
        <div class="pv-label">TODAY</div>
        <div class="pv-value" id="pageViewsToday">—</div>
      </div>

      <div class="pv-box" id="yesterdayPV">
        <div class="pv-label">YESTERDAY</div>
        <div class="pv-value" id="pageViewsYesterday">—</div>
      </div>

      <div class="pv-box clickable" id="extraFeature">
        <div class="pv-label">MORE</div>
        <div class="pv-value">⋯</div>
      </div>
      <div class="field" id="status">Checking token…</div>
      <button id="reauthenticateBtn" hidden>Reauthenticate</button>
    </div>
  `;
  shadow.appendChild(badge);

  // expose easy refs
  const header = shadow.getElementById("badgeHeader");
  const toggle = shadow.getElementById("expandToggle");
  const body = shadow.getElementById("badgeBody");
  const statusEl = shadow.getElementById("status");
  const reauthBtn = shadow.getElementById("reauthenticateBtn");

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
    badge.classList.remove("collapsed");
    badge.classList.add("expanded");
    body.setAttribute("aria-hidden", "false");
    await updateWidgetWithPageData(badge);
  } else {
    toggle.checked = false;
    badge.classList.add("collapsed");
    badge.classList.remove("expanded");
    body.setAttribute("aria-hidden", "true");
  }

  // ---------- toggle behavior ----------
  toggle.addEventListener("change", async () => {
    if (toggle.checked) {
      badge.classList.remove("collapsed");
      badge.classList.add("expanded");
      sessionStorage.setItem("adobePVExtensionToggle", "enabled");
      body.setAttribute("aria-hidden", "false");
      await updateWidgetWithPageData(badge);
    } else {
      badge.classList.add("collapsed");
      badge.classList.remove("expanded");
      sessionStorage.setItem("adobePVExtensionToggle", "disabled");
      body.setAttribute("aria-hidden", "true");
    }
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
    { passive: false }
  );
  document.addEventListener(
    "touchmove",
    (ev) => {
      const touch = ev.touches[0];
      if (!touch) return;
      doDrag(touch.clientX, touch.clientY);
    },
    { passive: false }
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

  async function updateWidgetWithPageData(badge) {
    badgeElem = badge;
    let resp = await checkToken();
    if (!resp) return;
    keepBackgroundAwake();
    chrome.runtime.sendMessage({ action: "GET_PAGE_REPORT", pageIdentifier: pageIdentifier }, (response) => {
      if (response.success) {
        let rows = response?.reportData?.rows || [];
        if (rows && rows.length >= 2) {
          const todayPV = rows[rows.length - 1].data[0];
          const yesterdayPV = rows[rows.length - 2].data[0];
          const todayPVElem = badge.querySelector("#pageViewsToday");
          const yesterdayPVElem = badge.querySelector("#pageViewsYesterday");
          todayPVElem.textContent = todayPV;
          yesterdayPVElem.textContent = yesterdayPV;
        }
      } else {
        if (badgeElem) {
          statusEl.textContent = "No data available for this page.";
        }
      }
      if (chrome.runtime.lastError) {
        return;
      }
    });
  }
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

function keepBackgroundAwake() {
  if (extCustomTimerID) clearInterval(extCustomTimerID);
  extCustomTimerID = setInterval(() => {
    chrome.runtime.sendMessage({ action: "KEEP_ALIVE" }, (res) => {
      if (chrome.runtime.lastError) {
        return;
      }
    });
  }, 10 * 1000);
  setTimeout(() => {
    clearInterval(extCustomTimerID);
  }, 2 * 60 * 1000);
}

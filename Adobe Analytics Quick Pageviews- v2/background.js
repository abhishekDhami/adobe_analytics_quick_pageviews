const tokenUrl = "https://ims-na1.adobelogin.com/ims/token/v3";
const authUrl = "https://ims-na1.adobelogin.com/ims/authorize";
const analyticsDiscoveryUrl = "https://analytics.adobe.io/discovery/me";
const reportingAPIURL = "https://analytics.adobe.io/api";
let sessionKey = null; // In-memory encryption key
let sessionTimer = null; // Timer for automatic expiry
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const WRAPPED_KEY_STORAGE = "wrappedSessionKey";
const DERIVED_KEY_SESSION = "derivedKeyCache";

// Listen for extension icon click to open options page
chrome.action.onClicked.addListener(() => {
  chrome.tabs.query({}, (tabs) => {
    const existing = tabs.find((tab) => tab.url?.includes("aph_options.html"));
    if (existing) {
      chrome.tabs.update(existing.id, { active: true });
    } else {
      chrome.runtime.openOptionsPage();
    }
  });
});

//all the actions from the content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "GET_TOKEN_VALIDITY") {
    getValidAccessToken().then((resp) => {
      sendResponse(resp);
    });
    return true; // Indicate async response
  } else if (msg.action === "OPEN_EXTENSION_OPTION") {
    chrome.runtime.openOptionsPage();
    chrome.runtime.sendMessage({ type: "RECHECK_TOKEN_STATUS" }, (res) => {
      if (chrome.runtime.lastError) {
        return;
      }
    });
  } else if (msg.action === "GET_ENABLED_ON_PAGE_FLAG") {
    getEnableOnPageFlag().then((isEnabled) => {
      sendResponse({ isEnabled });
    });
  } else if (msg.action === "GET_PAGE_IDENTIFIERS") {
    chrome.storage.local.get(["pageIdentifierConfig"], (result) => {
      let pageIdentifier = {};
      let config = result.pageIdentifierConfig;
      if (config) {
        pageIdentifier.source = config.source;
        pageIdentifier.windowPath = config.windowPathConfig.windowPath;
        sendResponse({ pageIdentifier: pageIdentifier, success: true });
      } else {
        sendResponse({ success: false });
      }
    });
  } else if (msg.action === "GET_REPORT") {
    // sendResponse({ received: true });
    getReport(msg.pageIdentifier, msg.reportType).then((reportData) => {
      sendResponse(reportData);
    });
    return true;
  }
  // else if (msg.action === "KEEP_ALIVE") {
  //   sendResponse({ alive: true });
  // }
  return true;
});

async function getEnableOnPageFlag() {
  const { enableOnPage } = await chrome.storage.local.get("enableOnPage");
  if (enableOnPage === undefined) return false;
  return enableOnPage;
}

function getReport(pageIdentifier, reportType = "pageViews") {
  return new Promise(async (resolve, reject) => {
    try {
      const { client_id, selectedCompanyID, selectedrsID, pageIdentifierConfig } = await chrome.storage.local.get(["client_id", "selectedCompanyID", "selectedrsID", "pageIdentifierConfig"]);

      if (pageIdentifier == undefined) resolve(null);

      let today = new Date();
      let endDate = new Date().setDate(today.getDate() + 1);
      let priorDate = new Date().setDate(today.getDate() - 6);
      let dateRangeString = `${new Date(priorDate).toISOString().split("T")[0]}T00:00:00.000/${new Date(endDate).toISOString().split("T")[0]}T00:00:00.000`;
      let segmentMatchCondition = pageIdentifierConfig.adobeDimensionConfig.match;
      if (segmentMatchCondition === "exact") {
        segmentMatchCondition = "streq";
      } else if (segmentMatchCondition === "contains") {
        segmentMatchCondition = "contains";
      } else {
        segmentMatchCondition = "contains";
      }

      let adobeDimension = pageIdentifierConfig.adobeDimensionConfig.dimension || "Page";
      adobeDimension = adobeDimension.toLowerCase();
      let pageIdentifierValue = "";
      if (pageIdentifierConfig.source === "url") {
        pageIdentifierValue = pageIdentifier.value;
        let urlObj = new URL(pageIdentifierValue);
        if (pageIdentifierConfig.urlConfig?.removeQuery) {
          urlObj.search = "";
        }
        if (pageIdentifierConfig.urlConfig?.removeHash) {
          urlObj.hash = "";
        }
        pageIdentifierValue = urlObj.toString();
      } else if (pageIdentifierConfig.source === "title") {
        pageIdentifierValue = pageIdentifier.value;
        if (pageIdentifierConfig.titleConfig?.lowercase) {
          pageIdentifierValue = pageIdentifierValue.toLowerCase();
        }
        if (pageIdentifierConfig.titleConfig?.trim) {
          pageIdentifierValue = pageIdentifierValue.trim();
        }
      } else if (pageIdentifierConfig.source === "window") {
        pageIdentifierValue = pageIdentifier.value;
      } else {
        resolve(null);
        return;
      }

      //Cropping value based on max length supported by Adobe Analytics for that dimension
      if (adobeDimension === "page" || adobeDimension.includes("prop")) {
        pageIdentifierValue = pageIdentifierValue.substring(0, 100);
      } else if (adobeDimension.includes("evar")) {
        pageIdentifierValue = pageIdentifierValue.substring(0, 250);
      }
      //creating matching condition, which can be shown on widget
      let matchCondition = `${adobeDimension} ${pageIdentifierConfig.adobeDimensionConfig.match} '${pageIdentifierValue}'`;
      chrome.storage.local.set({
        pageIdentifierCondition: matchCondition,
      });

      //Reading data from Cache first
      let cacheReadResponse = await readCache(selectedrsID, pageIdentifier.value, pageIdentifierConfig.adobeDimensionConfig.dimension, pageIdentifierConfig.adobeDimensionConfig.match, reportType);
      if (cacheReadResponse.data != null && cacheReadResponse.hit === true) {
        resolve({ reportData: cacheReadResponse.data, success: true, fromCache: true });
        return;
      }

      let metricsArray = [],
        rowDimension = "",
        customSettings = {};
      if (reportType === "countryData") {
        metricsArray = [
          {
            id: "metrics/pageviews",
            columnId: "0",
            sort: "desc",
          },
        ];
        rowDimension = "variables/geocountry";
        customSettings = {
          limit: 5,
        };
      } else if (reportType === "pageViews") {
        metricsArray = [
          {
            id: "metrics/pageviews",
            columnId: "0",
          },
          {
            id: "metrics/visits",
            columnId: "1",
          },
          {
            id: "metrics/visitors",
            columnId: "2",
          },
        ];
        rowDimension = "variables/daterangeday";
        customSettings = {
          limit: 7,
          dimensionSort: "asc",
        };
      }
      let predicates = [];
      predicates.push({
        func: "container",
        context: "hits",
        pred: {
          func: segmentMatchCondition,
          val: {
            func: "attr",
            name: `variables/${adobeDimension}`,
          },
          str: pageIdentifierValue,
        },
      });
      let reportReq = {
        rsid: selectedrsID,
        globalFilters: [
          {
            type: "dateRange",
            dateRange: dateRangeString,
          },
          {
            type: "segment",
            segmentDefinition: {
              func: "segment",
              version: [1, 0, 0],
              container: {
                func: "container",
                context: "hits",
                pred: {
                  func: "or",
                  preds: predicates,
                },
              },
            },
          },
        ],
        metricContainer: {
          metrics: metricsArray,
        },
        dimension: rowDimension,
        settings: customSettings,
      };
      let finalReportURL = `${reportingAPIURL}/${selectedCompanyID}/reports`;
      let tokenResponse = await getValidAccessToken();
      let accessToken;
      if (tokenResponse.success !== true) {
        resolve(tokenResponse);
        return;
      }
      accessToken = tokenResponse.accessToken;
      const resp = await fetch(finalReportURL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-api-key": client_id,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reportReq),
      });
      const reportData = await resp.json();
      let rows = reportData?.rows || [];
      if (rows && rows.length > 0) {
        let data = null;
        if (reportType === "pageViews") {
          data = { dates: [], pageViews: [], visits: [], visitors: [], filteredTotals: [] };
          rows.forEach((row) => {
            data.dates.push(row.value);
            data.pageViews.push(row.data[0]);
            data.visits.push(row.data[1]);
            data.visitors.push(row.data[2]);
          });
          data.filteredTotals = reportData?.summaryData?.filteredTotals || [];
        } else if (reportType === "countryData") {
          data = { countries: [], pageViews: [] };
          let totals = reportData?.summaryData.filteredTotals[0];
          rows.forEach((row) => {
            data.countries.push(row.value);
            let prctContribution = (row.data[0] / totals) * 100;
            prctContribution = prctContribution.toFixed(2);
            prctContribution = parseFloat(prctContribution);
            data.pageViews.push(prctContribution);
          });
        }
        saveCache(selectedrsID, pageIdentifier.value, pageIdentifierConfig.adobeDimensionConfig.dimension, pageIdentifierConfig.adobeDimensionConfig.match, reportType, data);
        resolve({ reportData: data, success: true, fromCache: false });
        cleanupExpiredCache();
      } else {
        resolve({ reportData: null, success: false });
      }
      return;
    } catch (error) {
      console.log("Error fetching page view data:", error);
      resolve({ error: "Failed to fetch page view data." });
    }
  });
}

function readCache(rsid, pageIdentifierValue, pageIdentifierDimension, pageIdentifierMatchType, reportType) {
  return new Promise(async (resolve, reject) => {
    try {
      let cacheKey = `CACHE||${rsid}||${pageIdentifierDimension}||${pageIdentifierMatchType}||${pageIdentifierValue}||${reportType}`;

      let pattern = /[^a-zA-Z0-9|\s]/g;
      cacheKey = cacheKey.replace(pattern, "");
      const result = await chrome.storage.local.get([cacheKey]);
      if (!result || !result[cacheKey]) {
        resolve({ hit: false, data: null });
        return;
      }
      const { data, ttl } = result[cacheKey];
      const now = new Date().getTime();
      // TTL expired
      if (!ttl || now > ttl) {
        await chrome.storage.local.remove([cacheKey]);
        resolve({ hit: false, data: null });
        return;
      }
      // Cache hit
      resolve({ hit: true, data });
    } catch (err) {
      resolve({ error: "Error reading from cache.", data: null });
    }
  });
}

async function saveCache(rsid, pageIdentifierValue, pageIdentifierDimension, pageIdentifierMatchType, reportType, reportData) {
  return new Promise(async (resolve, reject) => {
    try {
      let cacheKey = `CACHE||${rsid}||${pageIdentifierDimension}||${pageIdentifierMatchType}||${pageIdentifierValue}||${reportType}`;

      let pattern = /[^a-zA-Z0-9|\s]/g;
      cacheKey = cacheKey.replace(pattern, "");
      let ttl = new Date().getTime() + 15 * 60 * 1000; //15 minutes TTL
      await chrome.storage.local.set({ [cacheKey]: { data: reportData, ttl } });
    } catch (err) {
      resolve({ error: "Error saving to cache.", data: null });
    }
  });
}

async function cleanupExpiredCache() {
  const now = Date.now();

  const allItems = await chrome.storage.local.get(null);
  const keysToRemove = [];

  for (const [key, value] of Object.entries(allItems)) {
    if (!key.startsWith("CACHE||")) continue;
    if (!value || !value.ttl || now > value.ttl) {
      keysToRemove.push(key);
    }
  }

  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
}

// Function to set or reset session key
function setSessionKey(key) {
  sessionKey = key;
  // Reset expiry timer whenever new key set
  resetSessionTimer();
}

// Function to clear the session key
function clearSessionKey() {
  sessionKey = null;
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = null;
}

// Reset the expiry timer
function resetSessionTimer() {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    clearSessionKey();
  }, SESSION_TIMEOUT_MS);
}

// Listen for messages from options or popup
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  switch (msg.type) {
    case "GET_TOKEN_VALIDITY":
      const resp = await getValidAccessToken();
      sendResponse(resp);
      break;
    case "GET_KEY_STATUS":
      // Allow options page to check if key exists
      let hasKey = sessionKey !== null ? true : false;
      sendResponse({ hasKey: hasKey });
      break;

    case "AUTHENTICATE_USER":
      let client_id = msg.client_id;
      let client_secret = msg.client_secret;
      let org_id = msg.org_id;
      let userpassword = msg.userpassword;
      const redirectUri = chrome.identity.getRedirectURL();
      const scope = "additional_info.projectedProductContext, openid, read_organizations, additional_info.job_function, AdobeID";
      const params = new URLSearchParams({
        client_id,
        response_type: "code",
        redirect_uri: redirectUri,
        scope,
      });
      let authUrlwithParam = `${authUrl}?${params.toString()}`;

      chrome.identity.launchWebAuthFlow({ url: authUrlwithParam, interactive: true }, async (redirectResponse) => {
        try {
          if (chrome.runtime.lastError || !redirectResponse) {
            sendResponse({ error: "Authentication failed. Please try again with valid credentials" });
            return;
          }
          const code = new URL(redirectResponse).searchParams.get("code");

          const body = new URLSearchParams({
            grant_type: "authorization_code",
            client_id,
            client_secret,
            code,
          });

          const tokenResp = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
          });

          const tokenData = await tokenResp.json();

          if (!tokenData.access_token) {
            let msg = "Token fetch failed. Please try again with valid credentials.";
            if (tokenData.error) msg += ` Error: ${tokenData.error}`;
            sendResponse({ error: msg });
            return;
          }

          let expires_at = Date.now() + (tokenData.expires_in || 3600) * 1000;

          await encryptAndStoreCredentials(userpassword, tokenData.access_token, tokenData.refresh_token, client_id, client_secret, org_id, expires_at);
          // await chrome.storage.local.set({
          //   client_id,
          //   client_secret,
          //   org_id,
          //   accessToken: tokenData.access_token,
          //   refreshToken: tokenData.refresh_token,
          //   expires_at,
          // });
          let companyDataResponse = await fetchCompaniesAndSuites();
          if (companyDataResponse.success) {
            sendResponse({ success: true, companiesData: companyDataResponse.data });
            return;
          } else {
            sendResponse(companyDataResponse);
            return;
          }
        } catch (error) {
          sendResponse({ error: "An error occurred during authentication. Please try with valid credentials." });
          console.log(error);
        }
      });
      break;

    case "FETCH_COMPANIES":
      let companyDataResponse = await fetchCompaniesAndSuites();
      if (companyDataResponse.success) {
        sendResponse({ success: true, companiesData: companyDataResponse.data });
        return;
      } else {
        sendResponse(companyDataResponse);
        return;
      }
      break;

    case "FETCH_REPORT_SUITES":
      let companyId = msg.companyId;
      let suitesDataResponse = await fetchReportSuites(companyId);
      if (suitesDataResponse.success) {
        sendResponse({ success: true, suitesData: suitesDataResponse.suitesData });
        return;
      } else {
        sendResponse(suitesDataResponse);
        return;
      }
      break;

    case "VALIDATE_PASSWORD":
      let isPasswordValid = await validatePassword(msg.password);
      sendResponse({ isPasswordValid });
      break;
  }

  // Required for async sendResponse usage
  return true;
});

async function fetchCompaniesAndSuites() {
  let tokenResponse = await getValidAccessToken();
  let accessToken;
  if (tokenResponse.success !== true) {
    return tokenResponse;
  }
  accessToken = tokenResponse.accessToken;
  const { client_id, org_id } = await chrome.storage.local.get(["client_id", "org_id"]);
  const resp = await fetch(analyticsDiscoveryUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, "x-api-key": client_id },
  });
  const data = await resp.json();
  if (data.error_code) {
    return { ...data, reauthenticate: true };
  }
  return { data, success: true };
}

async function fetchReportSuites(companyId) {
  let tokenResponse = await getValidAccessToken();
  let accessToken;
  if (tokenResponse.success !== true) {
    return tokenResponse;
  }
  accessToken = tokenResponse.accessToken;
  const { client_id } = await chrome.storage.local.get(["client_id"]);
  await chrome.storage.local.set({
    selectedCompanyID: companyId,
  });
  const suitesResp = await fetch(`https://analytics.adobe.io/api/${companyId}/collections/suites?limit=30`, {
    headers: { Authorization: `Bearer ${accessToken}`, "x-api-key": client_id, "x-proxy-global-company-id": companyId },
  });
  const suitesData = await suitesResp.json();
  if (suitesData.error_code) {
    return { ...suitesData, reauthenticate: true };
  }
  return { suitesData: suitesData, success: true };
}

async function getValidAccessToken() {
  try {
    // try auto restore session key
    if (!sessionKey) {
      const cachedKey = await getCachedDerivedKey();

      if (cachedKey) {
        const { wrappedSessionKey } = await chrome.storage.local.get(WRAPPED_KEY_STORAGE);

        if (wrappedSessionKey) {
          sessionKey = await unwrapSessionKey(wrappedSessionKey, cachedKey);
          setSessionKey(sessionKey);
        }
      }
    }

    let isTokenValid = false;
    const { expires_at } = await chrome.storage.local.get("expires_at");
    if (expires_at && Date.now() < expires_at && sessionKey !== null) {
      isTokenValid = true;
    } else {
      isTokenValid = false;
    }
    if (isTokenValid == false) {
      //If sessionKey is not available, prompt for password
      if (sessionKey == null) {
        let { refreshToken } = await chrome.storage.local.get("refreshToken");
        if (refreshToken) return { reenterpassword: true };
        else return { reauthenticate: true };
        //If sessionKey is available but token expired, refresh token
      } else if (sessionKey != null) {
        //Refreshing token
        const resp = await decryptStoredCredentials(sessionKey);
        if (resp.success !== true) {
          return resp;
        }
        let { refreshToken } = resp;
        let tokenResponse = await refreshAccessToken(refreshToken);
        return tokenResponse;
      }
    } else {
      const resp = await decryptStoredCredentials(sessionKey);
      return resp;
    }
  } catch (error) {
    console.log("Error getting valid access token:", error);
    return { reauthenticate: true };
  }
}

async function refreshAccessToken(refreshToken) {
  try {
    const { client_id, client_secret } = await chrome.storage.local.get(["client_id", "client_secret"]);
    const body = new URLSearchParams({
      client_id: client_id,
      client_secret: client_secret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const tokenResp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const tokenData = await tokenResp.json();

    if (!tokenData.access_token) {
      if (tokenData.error) console.log(` Error: ${tokenData.error}`);
      return { reauthenticate: true };
    }

    let expires_at = Date.now() + (tokenData.expires_in || 3600) * 1000;
    let encryptedRefreshToken, encryptedAccessToken;
    encryptedRefreshToken = await encryptData(tokenData.refresh_token, sessionKey);
    encryptedAccessToken = await encryptData(tokenData.access_token, sessionKey);
    await chrome.storage.local.set({
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      expires_at,
    });

    return { accessToken: tokenData.access_token, success: true };
  } catch (error) {
    console.log("Error refreshing access token:", error);
    return { reauthenticate: true };
  }
}

// --------------------
// 🔐 Encryption Helpers
// --------------------

// Derive an AES-GCM key from a password (PBKDF2)
async function deriveKeyFromPassword(password, saltBase64) {
  const salt = saltBase64 ? Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 250000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );

  return { key, saltBase64: saltBase64 || btoa(String.fromCharCode(...salt)) };
}

// Encrypt plain text using AES-GCM key
async function encryptData(plainText, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.byteLength + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

// Decrypt base64 data using AES-GCM key
async function decryptData(encryptedBase64, key) {
  const data = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  const iv = data.slice(0, 12);
  const cipher = data.slice(12);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plainBuffer);
}

// --------------------------------------
// 🔒 Encrypt and Store Credentials Securely
// --------------------------------------
async function encryptAndStoreCredentials(password, accessToken, refreshToken, client_id, client_secret, org_id, expires_at) {
  const { key: derivedKey, saltBase64 } = await deriveKeyFromPassword(password);

  // NEW → create random session key
  const newSessionKey = await generateSessionKey();

  // wrap session key
  const wrapped = await wrapSessionKey(newSessionKey, derivedKey);

  // encrypt tokens with session key
  const encryptedAccessToken = await encryptData(accessToken, newSessionKey);
  const encryptedRefreshToken = await encryptData(refreshToken, newSessionKey);

  const encryptedVerifier = await encryptData("verify_secret", newSessionKey);

  // store wrapped key persistently
  await chrome.storage.local.set({
    accessToken: encryptedAccessToken,
    refreshToken: encryptedRefreshToken,
    encryptedVerifier,
    saltBase64,
    client_id,
    client_secret,
    org_id,
    expires_at,
    [WRAPPED_KEY_STORAGE]: wrapped,
  });

  // memory + session cache
  setSessionKey(newSessionKey);
  await cacheDerivedKey(derivedKey);
}

// --------------------------------------
// 🔓 Verify Password and Unlock Session
// --------------------------------------
async function validatePassword(password) {
  if (!password) return false;

  const { saltBase64 } = await chrome.storage.local.get(["saltBase64"]);
  const { wrappedSessionKey } = await chrome.storage.local.get(WRAPPED_KEY_STORAGE);

  if (!saltBase64 || !wrappedSessionKey) return false;

  try {
    const { key: derivedKey } = await deriveKeyFromPassword(password, saltBase64);

    const unwrappedSessionKey = await unwrapSessionKey(wrappedSessionKey, derivedKey);

    setSessionKey(unwrappedSessionKey);
    await cacheDerivedKey(derivedKey);

    return true;
  } catch {
    return false;
  }
}

// --------------------------------------
// 🔓 Decrypt Stored Credentials
// --------------------------------------
async function decryptStoredCredentials(key) {
  let { accessToken, refreshToken } = await chrome.storage.local.get(["accessToken", "refreshToken"]);

  if (!accessToken || !refreshToken) {
    console.warn("No encrypted tokens found. Reauthentication required.");
    return { reauthenticate: true };
  }
  try {
    accessToken = await decryptData(accessToken, key);
    refreshToken = await decryptData(refreshToken, key);

    return { accessToken, refreshToken, success: true };
  } catch (err) {
    console.log("Failed to decrypt credentials:", err);
    return { reauthenticate: true };
  }
}

// --------------------------------------
// 🔐 Session Key Wrapping Helpers (NEW)
// --------------------------------------

async function generateSessionKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function wrapSessionKey(sessionKey, derivedKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const wrapped = await crypto.subtle.wrapKey("raw", sessionKey, derivedKey, { name: "AES-GCM", iv });

  // prepend IV like you do in encryptData()
  const combined = new Uint8Array(iv.length + wrapped.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(wrapped), iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function unwrapSessionKey(wrappedBase64, derivedKey) {
  const data = Uint8Array.from(atob(wrappedBase64), (c) => c.charCodeAt(0));

  const iv = data.slice(0, 12);
  const cipher = data.slice(12);

  return crypto.subtle.unwrapKey("raw", cipher, derivedKey, { name: "AES-GCM", iv }, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function cacheDerivedKey(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(raw)));

  await chrome.storage.session.set({
    [DERIVED_KEY_SESSION]: base64,
  });
}

async function getCachedDerivedKey() {
  const res = await chrome.storage.session.get(DERIVED_KEY_SESSION);
  if (!res[DERIVED_KEY_SESSION]) return null;

  const raw = Uint8Array.from(atob(res[DERIVED_KEY_SESSION]), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);
}

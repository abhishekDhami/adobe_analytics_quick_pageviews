const tokenUrl = "https://ims-na1.adobelogin.com/ims/token/v3";
const authUrl = "https://ims-na1.adobelogin.com/ims/authorize";
const analyticsDiscoveryUrl = "https://analytics.adobe.io/discovery/me";
const reportingAPIURL = "https://analytics.adobe.io/api";
let sessionKey = null; // In-memory encryption key
let sessionTimer = null; // Timer for automatic expiry
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

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
  } else if (msg.action === "GET_PAGE_REPORT") {
    getPageViewData(msg.pageIdentifier).then((reportData) => {
      sendResponse(reportData);
    });
  } else if (msg.action === "KEEP_ALIVE") {
    sendResponse({ alive: true });
  }
  return true;
});

async function getEnableOnPageFlag() {
  const { enableOnPage } = await chrome.storage.local.get("enableOnPage");
  if (enableOnPage === undefined) return false;
  return enableOnPage;
}

function getPageViewData(pageIdentifier) {
  return new Promise(async (resolve, reject) => {
    try {
      const { client_id } = await chrome.storage.local.get(["client_id"]);
      const { selectedCompanyID, selectedrsID } = await chrome.storage.local.get(["selectedCompanyID", "selectedrsID"]);

      if (pageIdentifier.length === 0) resolve(null);
      let today = new Date();
      let endDate = new Date().setDate(today.getDate() + 1);
      let priorDate = new Date().setDate(today.getDate() - 6);
      let dateRangeString = `${new Date(priorDate).toISOString().split("T")[0]}T00:00:00.000/${new Date(endDate).toISOString().split("T")[0]}T00:00:00.000`;
      let predicates = [];
      for (let i = 0; i < pageIdentifier.length; i++) {
        predicates.push({
          func: "container",
          context: "hits",
          pred: {
            func: "contains",
            val: {
              func: "attr",
              name: "variables/page",
            },
            str: pageIdentifier[i],
          },
        });
      }
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
          metrics: [
            {
              id: "metrics/pageviews",
              columnId: "0",
            },
          ],
        },
        dimension: "variables/daterangeday",
        settings: {
          limit: 7,
          dimensionSort: "asc",
        },
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
      resolve({ reportData, success: true });
    } catch (error) {
      console.log("Error fetching page view data:", error);
      resolve({ error: "Failed to fetch page view data." });
    }
  });

  // const resp = await fetch("https://analytics.adobe.io/reports", {
  //   method: "POST",
  //   headers: {
  //     Authorization: `Bearer ${token}`,
  //     "x-proxy-global-company-id": companyId,
  //     "x-api-key": companyId,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify(reportReq),
  // });

  // return await resp.json();
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
    false,
    ["encrypt", "decrypt"]
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
  const { key, saltBase64 } = await deriveKeyFromPassword(password);
  setSessionKey(key); // Store key in memory for session
  const encryptedAccessToken = await encryptData(accessToken, key);
  const encryptedRefreshToken = await encryptData(refreshToken, key);

  // Create a password verifier string
  const encryptedVerifier = await encryptData("verify_secret", key);

  await chrome.storage.local.set({
    accessToken: encryptedAccessToken,
    refreshToken: encryptedRefreshToken,
    encryptedVerifier, // 👈 new field for local password verification,
    client_id,
    client_secret,
    saltBase64,
    org_id,
    expires_at,
  });
}

// --------------------------------------
// 🔓 Verify Password and Unlock Session
// --------------------------------------
async function validatePassword(password) {
  if (!password) {
    return false;
  }

  const { encryptedVerifier, saltBase64 } = await chrome.storage.local.get(["encryptedVerifier", "saltBase64"]);

  if (!encryptedVerifier || !saltBase64) {
    return false;
  }

  try {
    const { key } = await deriveKeyFromPassword(password, saltBase64);
    const verifierPlain = await decryptData(encryptedVerifier, key);

    if (verifierPlain !== "verify_secret") {
      return false;
    }

    // ✅ Password is correct; send key to background for 4-hour session
    setSessionKey(key);
    return true;
  } catch (err) {
    console.log("Password verification failed:", err);
    console.log("Incorrect password, please try again or reauthenticate.");
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

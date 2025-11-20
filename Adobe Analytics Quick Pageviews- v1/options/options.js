const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const authBtn = document.getElementById("authBtn");
const clearAuthBtn = document.getElementById("clearAuthBtn");
const saveConfigBtn = document.getElementById("saveConfigBtn");
const clearConfigBtn = document.getElementById("clearConfigBtn");
const companySelect = document.getElementById("companySelect");
const rsidSelect = document.getElementById("rsidSelect");
const enableOnPageToggle = document.getElementById("enableOnPageToggle");
const retrieveAccessTokenBtn = document.getElementById("retrieveAccessTokenBtn");
let messageQueue = [],
  msgCount = 1;

document.addEventListener("DOMContentLoaded", async () => {
  const { client_id, client_secret, org_id, enableOnPage } = await chrome.storage.local.get(["client_id", "client_secret", "org_id", "enableOnPage"]);
  //populating step1 fields if already saved
  let client_idElem = document.getElementById("clientId");
  let client_secretElem = document.getElementById("clientSecret");
  let org_idElem = document.getElementById("orgid");
  if (client_id) {
    client_idElem.value = client_id;
    client_idElem.disabled = true;
  }
  if (client_secret) {
    client_secretElem.value = client_secret;
    client_secretElem.disabled = true;
  }
  if (org_id) {
    org_idElem.value = org_id;
    org_idElem.disabled = true;
  }
  if (enableOnPage !== undefined) {
    enableOnPageToggle.checked = enableOnPage;
  }
  //populating step2 fields if already saved
  let { credsStored } = await chrome.storage.local.get(["credsStored"]);
  if (credsStored) {
    await populateStep2Fields();
  }
});

authBtn.addEventListener("click", async () => {
  try {
    let client_id = document.getElementById("clientId").value.trim();
    let client_secret = document.getElementById("clientSecret").value.trim();
    let org_id = document.getElementById("orgid").value.trim();
    let userpassword = document.getElementById("userpassword").value;
    if (!client_id || !client_secret || !org_id || !userpassword) {
      showMessage({ msg: "Please enter valid Client ID, Secret, Org ID and Password.", type: "error" });
      return;
    }
    if (userpassword.length < 6) {
      showMessage({ msg: "Password should be at least 6 characters long.", type: "error" });
      return;
    }
    chrome.runtime.sendMessage({ type: "AUTHENTICATE_USER", client_id, client_secret, org_id, userpassword }, async (response) => {
      if (response.error) {
        showMessage({ msg: "Error occured while Authenticating: " + response.error, type: "error" });
        return;
      } else if (response.success) {
        authBtn.disabled = true;
        showMessage({ msg: "Authenticated and Credentials fetched!", type: "success" });
        populateCompaniesAndSuites(response.companiesData);
        await chrome.storage.local.set({ credsStored: true });
      }
      if (chrome.runtime.lastError) {
        return;
      }
    });
  } catch (error) {
    showMessage({ msg: "An error occurred during authentication. Please try with valid credentials.", type: "error" });
    console.error(error);
  }
});

clearAuthBtn.addEventListener("click", async () => {
  await chrome.storage.local.clear();
  let client_idElem = document.getElementById("clientId");
  let client_secretElem = document.getElementById("clientSecret");
  let org_idElem = document.getElementById("orgid");
  let userpasswordElem = document.getElementById("userpassword");
  userpasswordElem.value = "";
  client_idElem.value = "";
  client_idElem.disabled = false;
  client_secretElem.value = "";
  client_secretElem.disabled = false;
  org_idElem.value = "";
  org_idElem.disabled = false;
  rsidSelect.innerHTML = "";
  companySelect.innerHTML = "<option value='' disabled selected>Select company</option>";
  showMessage({ msg: "Authentication cleared.", type: "info" });
  step2.style.display = "none";
  authBtn.disabled = false;
  rsidSelect.disabled = true;
  location.reload();
});

async function populateCompaniesAndSuites(companiesData) {
  const data = companiesData;
  const { org_id } = await chrome.storage.local.get(["org_id"]);

  if (data.imsOrgs === undefined || data.imsOrgs.length === 0) {
    showMessage({ msg: "No organizations found for logged in user.", type: "error" });
    return;
  }
  let companies = [];
  data.imsOrgs.forEach((org) => {
    if (org.imsOrgId === org_id) {
      if (org.companies === undefined || org.companies.length === 0) {
        showMessage({ msg: "No companies found for provided Org ID. Clear credentials and try again.", type: "error" });
        return;
      }
      org.companies.forEach((company) => {
        let opt = document.createElement("option");
        opt.value = company.globalCompanyId;
        opt.textContent = `${company.companyName} (${company.globalCompanyId})`;
        companySelect.appendChild(opt);
      });
      companies = org.companies;
    }
  });
  companies = JSON.stringify(companies);
  await chrome.storage.local.set({ companiesList: companies });
  step2.style.display = "block";
}

async function fetchCompaniesData() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "FETCH_COMPANIES" }, async (response) => {
      if (response.success) {
        let companiesData = response.companiesData;
        resolve({ companiesData, success: true });
      } else {
        handleTokenErrorResponse(response);
        resolve({}); // Resolve with empty object to prevent further processing
        return;
      }
      if (chrome.runtime.lastError) {
        return;
      }
    });
  });
}

companySelect.addEventListener("change", async () => {
  let companyId = companySelect.value;
  if (!companyId) return;
  let rsids = [];

  chrome.runtime.sendMessage({ type: "FETCH_REPORT_SUITES", companyId }, async (response) => {
    if (response.success) {
      let suitesData = response.suitesData;
      if (suitesData.content === undefined || suitesData.content.length === 0) {
        showMessage({ msg: "No accesible report suites found for selected Company. Select other company or clear credentials and try again.", type: "error" });
        return;
      }
      //defualt option
      rsidSelect.innerHTML = "";
      let defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = "Select report suite";
      defaultOpt.selected = true;
      defaultOpt.disabled = true;
      rsidSelect.appendChild(defaultOpt);
      suitesData.content.forEach((suite) => {
        const opt = document.createElement("option");
        opt.value = suite.rsid;
        opt.textContent = `${suite.name} (${suite.rsid})`;
        rsidSelect.appendChild(opt);
      });
      rsids = JSON.stringify(suitesData.content);
      rsidSelect.disabled = false;
      await chrome.storage.local.set({ rsidsList: rsids });
    } else {
      handleTokenErrorResponse(response);
    }
    if (chrome.runtime.lastError) {
      return;
    }
  });
});

saveConfigBtn.onclick = async () => {
  const rsid = rsidSelect.value;
  await chrome.storage.local.set({
    selectedrsID: rsid,
  });
  showMessage({ msg: "Configuration saved successfully!", type: "success" });
  showMessage({ msg: "Now Go to any webpage, Pageview report will be shown at the header", type: "info" });
};

clearConfigBtn.onclick = async () => {
  await clearStep2Fields();
};

function askUserToReauthenticate() {
  showMessage({ msg: "Please re-authenticate to continue.", type: "info" });
  authBtn.disabled = false;
  step2.style.display = "none";
  let userpasswordElem = document.getElementById("userpassword");
  userpasswordElem.value = ""; //dummy value to indicate password is set
  userpasswordElem.disabled = false;
  userpasswordElem.type = "text";
  //remove accessToken, Refreshtoken, expires_at, encyptedVarifier, saltBase64, "credsStored"
  chrome.storage.local.remove(["accessToken", "refreshToken", "expires_at", "encryptedVerifier", "saltBase64", "credsStored"]);
  retrieveAccessTokenBtn.hidden = true;
}

function showMessage(info = {}, processNextMsg = false) {
  if (messageQueue.length === 0) {
    messageQueue.push(info);
    processNextMsg = true;
  }
  if (processNextMsg) {
    let msgInfo = messageQueue[0];
    showToast({ title: "Notification", message: msgInfo.msg, type: msgInfo.type });
    setTimeout(() => {
      messageQueue.shift();
      msgCount = msgCount - 1;
    }, 1000);
    return;
  } else {
    msgCount = msgCount + 1;
    console.log(msgCount);
    setTimeout(() => {
      showMessage(info);
    }, 2000 * msgCount);
  }
}

/* Toast utility */

const TOAST_CONTAINER_ID = "__toast_container__";
function ensureContainer() {
  let c = document.getElementById(TOAST_CONTAINER_ID);
  if (!c) {
    c = document.createElement("div");
    c.id = TOAST_CONTAINER_ID;
    c.className = "toast-container";
    document.body.appendChild(c);
  }
  return c;
}

/**
 * showToast(options)
 * options: {
 *   title: string (optional),
 *   message: string (required),
 *   type: 'success'|'error'|'warning'|'info' (defaults to 'info'),
 *   timeout: milliseconds (defaults to 4500)
 * }
 */
function showToast(opts = {}) {
  const { title = "", message = "", type = "info", timeout = 2500 } = opts;
  if (!message) return;

  const container = ensureContainer();

  const toast = document.createElement("div");
  toast.className = "toast " + (type === "info" ? "" : type);
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  const icon = document.createElement("div");
  icon.className = "toast-icon";
  icon.innerText = type === "success" ? "\u2713" : type === "error" ? "\u2717" : type === "warning" ? "\u2757" : "i";

  const body = document.createElement("div");
  body.className = "toast-body";
  if (title) {
    const t = document.createElement("div");
    t.className = "toast-title";
    t.innerText = title;
    body.appendChild(t);
  }
  const msg = document.createElement("div");
  msg.className = "toast-msg";
  msg.innerText = message;
  body.appendChild(msg);

  const close = document.createElement("button");
  close.className = "toast-close";
  close.setAttribute("aria-label", "Close notification");
  close.innerHTML = "&#10005;"; // ×
  close.addEventListener("click", () => removeToast(toast));

  toast.appendChild(icon);
  toast.appendChild(body);
  toast.appendChild(close);

  // append & animate
  container.insertBefore(toast, container.firstChild);
  // small delay to allow transition
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  // auto-dismiss with pause-on-hover
  let autoDismiss = true;
  let timeoutId = null;
  const startTimer = () => {
    if (!autoDismiss) return;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => removeToast(toast), timeout);
  };
  const stopTimer = () => {
    clearTimeout(timeoutId);
  };

  toast.addEventListener("mouseenter", () => {
    autoDismiss = false;
    stopTimer();
  });
  toast.addEventListener("mouseleave", () => {
    autoDismiss = true;
    startTimer();
  });

  // start auto dismiss
  startTimer();

  // remove helper
  function removeToast(el) {
    if (!el) return;
    el.classList.remove("show");
    // give time for animation
    setTimeout(() => {
      try {
        el.remove();
      } catch (e) {}
    }, 220);
  }

  // return a handle if caller wants to remove manually
  return {
    remove: () => removeToast(toast),
  };
}
/* Toast utility */

async function clearStep2Fields() {
  rsidSelect.innerHTML = "";
  rsidSelect.disabled = true;
  companySelect.innerHTML = "<option value='' disabled selected>Select company</option>";
  await chrome.storage.local.remove(["selectedCompanyID", "selectedrsID"]);
  showMessage({ msg: "Configuration cleared.", type: "success" });
  showMessage({ msg: "Select company and report suite again.", type: "info" });
  populateStep2Fields(true);
}

async function populateStep2Fields(defaultSetting = false) {
  chrome.runtime.sendMessage({ type: "GET_TOKEN_VALIDITY" }, async (response) => {
    if (response.success == true) {
      const { selectedCompanyID, selectedrsID, companiesList, rsidsList } = await chrome.storage.local.get(["selectedCompanyID", "selectedrsID", "companiesList", "rsidsList"]);
      if (selectedCompanyID && selectedrsID) {
        step2.style.display = "block";
        if (companiesList) {
          companySelect.innerHTML = "";
          if (defaultSetting) {
            let opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "Select company";
            opt.selected = true;
            opt.disabled = true;
            companySelect.appendChild(opt);
          }
          let companies = JSON.parse(companiesList);
          companies.forEach((company) => {
            let opt = document.createElement("option");
            opt.value = company.globalCompanyId;
            opt.textContent = `${company.companyName} (${company.globalCompanyId})`;
            if (selectedCompanyID && selectedCompanyID === company.globalCompanyId && !defaultSetting) {
              opt.selected = true;
            }
            companySelect.appendChild(opt);
          });
        }
        if (rsidsList && !defaultSetting) {
          let rsids = JSON.parse(rsidsList);
          rsidSelect.disabled = false;
          rsids.forEach((suite) => {
            const opt = document.createElement("option");
            opt.value = suite.rsid;
            opt.textContent = `${suite.name} (${suite.rsid})`;
            if (selectedrsID && selectedrsID === suite.rsid) {
              opt.selected = true;
            }
            rsidSelect.appendChild(opt);
          });
        }
        authBtn.disabled = true;
        let userpasswordElem = document.getElementById("userpassword");
        userpasswordElem.value = "ABCD"; //dummy value to indicate password is set
        userpasswordElem.disabled = true;
        userpasswordElem.type = "password";
      } else {
        let resp = await fetchCompaniesData();
        if (resp.success) {
          populateCompaniesAndSuites(resp.companiesData);
          let userpasswordElem = document.getElementById("userpassword");
          userpasswordElem.value = "ABCD"; //dummy value to indicate password is set
          userpasswordElem.disabled = true;
          userpasswordElem.type = "password";
        }
        // let userpasswordElem = document.getElementById("userpassword");
        // userpasswordElem.value = "ABCD"; //dummy value to indicate password is set
        // userpasswordElem.disabled = true;
        // userpasswordElem.type = "password";
      }
    } else {
      handleTokenErrorResponse(response);
    }
    if (chrome.runtime.lastError) {
      return;
    }
  });
}

async function handleTokenErrorResponse(response) {
  step2.style.display = "none";
  if (response.reauthenticate) {
    askUserToReauthenticate();
  } else if (response.reenterpassword) {
    let userpasswordElem = document.getElementById("userpassword");
    userpasswordElem.value = ""; //dummy value to indicate password is set
    userpasswordElem.disabled = false;
    userpasswordElem.type = "text";
    showMessage({ msg: "Please re-enter your password to continue.", type: "info" });
    const { refreshToken } = await chrome.storage.local.get(["refreshToken"]);
    if (refreshToken) {
      retrieveAccessTokenBtn.hidden = false;
    }
    let { credsStored } = await chrome.storage.local.get(["credsStored"]);
    if (credsStored) {
      authBtn.disabled = true;
    }
  }
}

retrieveAccessTokenBtn.addEventListener("click", async () => {
  let userpassword = document.getElementById("userpassword").value;
  if (!userpassword) {
    showMessage({ msg: "Please enter your password to continue.", type: "error" });
    return;
  }
  showMessage({ msg: "Validating password...", type: "info" });
  chrome.runtime.sendMessage({ type: "VALIDATE_PASSWORD", password: userpassword }, async (response) => {
    if (response.isPasswordValid == true) {
      showMessage({ msg: "Password validated. Kindly return back to website and Refresh the page to fetch data.", type: "success" });
      populateStep2Fields(false);
      retrieveAccessTokenBtn.hidden = true;
      authBtn.disabled = true;
    } else {
      showMessage({ msg: "Invalid password. Please try again or Re-authenticate.", type: "error" });
      authBtn.disabled = false;
    }
    if (chrome.runtime.lastError) {
      return;
    }
  });
});

enableOnPageToggle.addEventListener("change", async () => {
  const isEnabled = enableOnPageToggle.checked;
  await chrome.storage.local.set({ enableOnPage: isEnabled });
});

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type == "RECHECK_TOKEN_STATUS") {
    let { credsStored } = await chrome.storage.local.get(["credsStored"]);
    if (credsStored) {
      populateStep2Fields();
    }
    sendResponse();
  }
  return true;
});

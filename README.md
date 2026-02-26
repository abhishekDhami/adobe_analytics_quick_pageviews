# Adobe Analytics Quick PageViews

A lightweight Chrome extension that shows Adobe Analytics PageViews, Visits, Visitors, and Country breakdown directly on any webpage — without opening Workspace.

## 🚀 What It Does

This extension adds a floating, draggable widget on any webpage that provides instant access to your Adobe Analytics data:

**Minimal View**
- Today's and Yesterday's Page Views at a glance

**Expanded Dashboard**
- Tab-based navigation: **Page Performance** and **Custom Report**
- Trend charts for PageViews, Visits, and Visitors
- Top 5 Countries breakdown with traffic share percentages
- Flexible date range: Last 7 Days, 3 Weeks, 5 Weeks, 3 Months, or 6 Months
- Daily, weekly, or monthly chart granularity based on selected range
- Large numbers formatted for readability (e.g., 1.24M, 4.56M)
- One-click data refresh and CSV export

**Custom Report**
- Configure a primary dimension filter (any Prop or eVar) with exact/contains match
- Optional secondary dimension filter with values scoped to the primary selection
- Same metrics and charts as Page Performance, filtered by your custom dimensions
- Secondary filter dropdown directly on the widget for quick switching

**Smart Behaviors**
- Widget remembers its position, toggle state, view mode, and active tab across page navigations
- SPA (Single Page Application) support — widget updates automatically on route changes
- Date calculations use the report suite's configured timezone for accuracy
- Optimized API calls — no redundant fetches when restoring state

Designed for Web Analysts, Adobe Analytics Developers, QA Teams, and Marketing Users.

---

## 🔐 Security First

This extension is built with security as a priority:

- Uses **your own Adobe OAuth credentials** — nothing shared
- Access tokens encrypted locally using **AES-GCM**
- Password-based key derivation (**PBKDF2**) protects the encryption key
- Session auto-expires after 4 hours
- Tokens never leave your browser
- No external servers, no tracking, no analytics collection, no user data collection

All credentials are stored locally using Chrome storage APIs.

---

## ⚙️ Setup

1. Install the extension from [Chrome Web Store](https://chromewebstore.google.com/detail/oommkcdglakgcanecjjfbmoipcfiljbe).
2. Click the extension icon to open the Settings page.
3. **Step 1** — Enter your Adobe Developer Console OAuth credentials (Client ID, Client Secret, Org ID) and set a local password. Click Authenticate.
4. **Step 2** — Select your Company and Report Suite.
5. **Step 3** — Configure how the extension identifies pages:
   - **URL** — full URL or pathname, with options to remove query string and hash
   - **Page Title** — document.title with trim/lowercase options
   - **Window Variable** — any JavaScript path (e.g., `s.pageName`, `datalayer.adobe['sdk.customPageName']`)
   - Choose the matching Adobe dimension (Page, Prop, eVar) and match type (exact/contains)
6. **Step 4** *(Optional)* — Configure a Custom Report with primary and secondary dimension filters.
7. Save and enable the floating widget.

---

## 🧩 Features

**Widget**
- Minimal view with Today & Yesterday page views
- Expandable dashboard with tab navigation
- Draggable widget with position memory
- Settings gear icon for quick access to options page
- Refresh button to re-fetch data on demand
- Export to CSV with filter conditions, report suite ID, and granularity labels
- Feedback link to Chrome Web Store

**Date Ranges**
- Last 7 Days (daily granularity)
- Last 3 Weeks / 5 Weeks (weekly granularity)
- Last 3 Months / 6 Months (monthly granularity)
- Date calculations aligned to report suite timezone

**Page Performance Tab**
- PageViews, Visits, Visitors trend charts
- Top 5 Countries with traffic share
- Filter condition footer showing active page identifier

**Custom Report Tab**
- Configurable primary dimension filter (Props and eVars)
- Optional secondary dimension with scoped values
- Filter bar showing active conditions with inline secondary dropdown
- Disabled state with tooltip when not configured

**Page Identifier Options**
- URL (full or pathname, with query/hash removal)
- Page Title (with trim and lowercase)
- Window Variable (supports dot notation, bracket notation, and mixed paths)
- Match type: exact or contains
- Automatic Adobe truncation handling (100 bytes for Props, 250 for eVars)

**SPA Support**
- Detects navigation via History API (pushState, replaceState, popstate)
- URL polling fallback for edge cases
- Debounced re-fetch on route change

---

## 📦 Export

The CSV export includes:
- Report name and date range
- Export timestamp
- Report Suite ID
- Active filter conditions
- Date-wise trend data with granularity label (Daily/Weekly/Monthly)
- Total PageViews, Visits, and Visitors
- Country breakdown with raw pageview counts and traffic share percentages

---

## 🛠 Tech Stack

- Chrome Extension Manifest V3
- Adobe Analytics 2.0 Reporting API
- Web OAuth 2.0 (via `chrome.identity.launchWebAuthFlow`)
- Web Crypto API (AES-GCM + PBKDF2)
- Chart.js for visualization
- Shadow DOM for widget isolation
- Intl.DateTimeFormat for timezone-aware date calculations

---

## 📖 Documentation

Medium walkthrough:  
[Introducing Adobe Analytics PageView Helper Chrome Extension](https://medium.com/@dhamiabhishek3496/introducing-adobe-analytics-pageview-helper-chrome-extension-b4c2901a1d7f)

---

## 📄 License

This project is licensed under the MIT License.

---

## ❤️ Built For The Adobe Analytics Community

Created by **Abhishek Dhami**  
Adobe Analytics Developer

Contributions, feedback, and feature requests are welcome!  
[Leave a review on Chrome Web Store](https://chromewebstore.google.com/detail/oommkcdglakgcanecjjfbmoipcfiljbe)

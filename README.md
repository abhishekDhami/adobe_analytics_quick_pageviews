# Adobe Analytics Quick PageViews

A lightweight Chrome extension that shows Adobe Analytics PageViews directly on any webpage — without opening Workspace.

## 🚀 What It Does

This extension adds a floating widget on any webpage that displays:

- Today’s Page Views
- Yesterday’s Page Views
- 7-day trend charts (PageViews, Visits, Visitors)
- Top Countries breakdown (percentage contribution)
- Expandable dashboard view
- Draggable widget (position remembered)

Designed for:
- Web Analysts
- Adobe Analytics Developers
- QA Teams
- Marketing Users

---

## 🔐 Security First

This extension is built with security as a priority:

- Uses **your own Adobe OAuth credentials**
- Access tokens encrypted locally using **AES-GCM**
- Password-based key derivation (PBKDF2)
- Tokens never leave your browser
- No external servers
- No tracking
- No analytics collection
- No user data collection

All credentials are stored locally using Chrome storage APIs.

---

## 🧩 Features

- Minimal View (Today & Yesterday)
- Expandable Dashboard View
- 7-Day Trend Charts
- Top Countries (Percentage Contribution)
- Page Identifier Customization:
  - URL
  - document.title
  - s.pageName
  - Match type: exact / contains
  - Query/hash removal options
- Supports staging, production, and development environments

---

## ⚙️ Setup

1. Install the extension from Chrome Web Store.
2. Add your Adobe Developer Console OAuth credentials.
3. Authenticate.
4. Select Company ID and Report Suite.
5. Configure Page Identifier logic.
6. Enable the floating widget.

---

## 📦 Current Scope

The extension currently supports:

- Page-level reporting
- PageViews
- Visits
- Visitors
- Country breakdown
- 7-day trend
- Secure OAuth-based access

---

## 🛠 Tech Stack

- Chrome Extension Manifest v3
- Adobe Analytics Reporting API
- Web OAuth 2.0
- Web Crypto API (AES-GCM encryption)
- Chart.js for visualization

---

## 📖 Documentation

Medium walkthrough:
https://medium.com/@dhamiabhishek3496/introducing-adobe-analytics-pageview-helper-chrome-extension-b4c2901a1d7f

---

## 📄 License

This project is licensed under the MIT License.

---

## ❤️ Built For The Adobe Analytics Community

Created by Abhishek Dhami  
Adobe Analytics Developer  

Contributions, feedback, and feature requests are welcome!

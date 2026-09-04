<div align="center">

# ❤️ LifeShare
### Connected Hospital Resource Network

LifeShare is a secure, real-time platform that lets verified hospitals share life-critical resources — organs, medical equipment, and blood units — across a connected network, cutting the time it takes to find what a patient urgently needs.

[![Status](https://img.shields.io/badge/status-in%20development-yellow?style=for-the-badge)](#)
[![React](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](#)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white)](#)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Why This Project Matters](#-why-this-project-matters)
- [How It Works](#️-how-it-works)
- [Key Features](#-key-features)
- [Screenshots / Demo](#-screenshots--demo)
- [Tech Stack](#️-tech-stack)
- [Getting Started](#-getting-started)
- [Future Scope](#-future-scope)
- [Contributing](#-contributing)

---

## 🩺 Overview

Instead of every hospital operating in isolation, **LifeShare** creates a connected network where availability, urgency, and compatibility are visible instantly. Verified hospitals can:

| Capability | Description |
|---|---|
| 🫀 **Request Organs** | Submit requests based on urgency and compatibility |
| 🩻 **Share Equipment** | List ventilators, ICU beds, and specialized devices for temporary sharing |
| 📍 **Track in Real Time** | See live availability and location of organs and equipment |
| 🔔 **Get Instant Alerts** | Receive notifications the moment a needed resource becomes available |
| 🔐 **Access Securely** | Only verified, authorized hospital staff can use the system |

---

## 🌍 Why This Project Matters

**1. Saves Human Lives**
A patient may urgently need a heart, kidney, or liver that's already available at another hospital. Without a connected system, locating it can take hours. LifeShare closes that gap with instant, network-wide visibility.

**2. Better Utilization of Medical Resources**
Expensive equipment often sits idle at one hospital while another nearby hospital urgently needs it. LifeShare enables temporary sharing instead of redundant purchasing — reducing waste and improving overall healthcare efficiency.

**3. Faster Emergency Response**
During road accidents, transplant emergencies, natural disasters, or pandemics, every minute matters. LifeShare lets hospitals send requests, locate nearby resources, and begin transport immediately.

**4. Real-Time Visibility**
Hospitals often don't know which hospital has a kidney available, where a ventilator currently is, or whether an organ has already been dispatched. LifeShare solves this with live tracking and status updates.

**5. Secure Medical Collaboration**
Medical data is highly sensitive. Access is restricted to verified hospital authorities only, reducing the risk of unauthorized access and protecting patient-related information.

**6. Supports Government Healthcare Planning**
A centralized network generates valuable data on organ demand, equipment shortages, and regional healthcare needs — insights that can inform better public health policy and emergency planning.

---

## ⚙️ How It Works

```
1. Hospital updates available organs/equipment
            │
            ▼
2. Information syncs across the network
            │
            ▼
3. Another hospital places a request
            │
            ▼
4. System checks priority & compatibility
            │
            ▼
5. Authorized staff approve the request
            │
            ▼
6. Instant notifications are sent
            │
            ▼
7. Organ/equipment is dispatched
            │
            ▼
8. Live tracking continues until delivery ✅
```

---

## ✨ Key Features

- 🌐 **Real-Time Global Inventory Dashboard** — live listings of available organs, blood inventory, and critical equipment across the network
- ⚡ **Instant Waitlist Matching** — hospitals join an automated waitlist when a resource isn't available, and get notified the moment it is
- 🤝 **Network Synergy Rating** — hospitals earn a rating for successfully sharing and matching life-saving resources, encouraging collaboration
- 🔐 **Secure Access** — restricted to verified hospital administrators via JWT-based authentication
- 🔔 **Live Alerts** — instant WebSocket notifications for matches, acceptances, and newly available resources
- 📊 **Immutable Activity Log** — a transparent record of every transaction between hospitals for ethical auditing

---

## 📸 Screenshots / Demo

> _Screenshots and a demo GIF coming soon._

| Dashboard | Resource Request | Geographic Map |
|---|---|---|
| _placeholder_ | _placeholder_ | _placeholder_ |

---

## 🛠️ Tech Stack

**Frontend**

![React](https://img.shields.io/badge/React%2019-20232A?style=for-the-badge&logo=react&logoColor=61DAFB) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white) ![TailwindCSS](https://img.shields.io/badge/Tailwind%20CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white) ![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)

**Backend**

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white) ![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white) ![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white) ![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)

**Database**

![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)

---

## 🚀 Getting Started

### Prerequisites
[Node.js](https://nodejs.org/) installed on your machine.

### 1. Clone & Install
```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure Environment
Copy `.env.example` to `server/.env`. Set `JWT_SECRET` and `PORT`.

### 3. Initialize the Database
```bash
cd server
node initialize_sqlite.js
```

### 4. Import the Hospital Directory (30,273 hospitals)
```bash
# Place CSV at: data/hospital_directory.csv (project root)
cd server
npm run import:hospitals
```
> Idempotent — safe to re-run. Existing records are skipped.

### 5. Import the Blood Bank Directory (2,947 blood banks)
```bash
# Place XLS at: data/Blood_bank_updated-sep_2015.xls (project root)
cd server
npm run import:bloodbanks
```

### 6. Seed Demo Data
```bash
cd server && npm run seed
```
> Demo login: `city@central.com` / `password123`

### 7. Run the App

**Terminal 1 — Backend**
```bash
cd server && npm run dev   # http://localhost:5000
```

**Terminal 2 — Frontend**
```bash
cd client && npm run dev   # http://localhost:5173
```

The Hospital and Blood Bank Directories at `/hospitals` and `/blood-banks`, as well as the map at `/map`, are publicly accessible without login.

---

## 🏥 Hospital Directory Dataset

### Dataset Information
| Property | Value |
|---|---|
| File | `data/hospital_directory.csv` |
| Total records | 30,273 hospitals |
| States / UTs | 36 |
| CSV columns | 48 fields |
| Records with coordinates | ~10,951 (36.2%) |

> ⚠️ **Static Reference Data**: This directory contains government hospital contact information only. It does NOT represent real-time bed availability, blood stock, organ availability, or emergency capacity. Real-time resource data is managed by verified LifeShare hospital accounts.

---

## 🩸 Blood Bank Directory Dataset

### Dataset Information
| Property | Value |
|---|---|
| File | `data/Blood_bank_updated-sep_2015.xls` |
| Total records | 2,947 blood banks |
| Records with coordinates | 898 (30.5%) |

> ⚠️ **Static Reference Data**: This directory contains government blood bank contact information only. It does NOT represent real-time blood availability. Real-time resource data is managed by verified LifeShare hospital accounts.

---

## 🌐 API Endpoints

### Hospital Directory (Public — no authentication required)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/hospitals` | Paginated hospital list |
| `GET` | `/api/hospitals/:id` | Single hospital detail |
| `GET` | `/api/hospitals/states` | All distinct states |
| `GET` | `/api/hospitals/districts?state=X` | Districts by state |
| `GET` | `/api/hospitals/nearby` | Map bounding box query |

### Blood Bank Directory (Public — no authentication required)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/blood-banks` | Paginated blood bank list |
| `GET` | `/api/blood-banks/:id` | Single blood bank detail |
| `GET` | `/api/blood-banks/states` | All distinct states |
| `GET` | `/api/blood-banks/districts?state=X` | Districts by state |
| `GET` | `/api/blood-banks/nearby` | Map bounding box query |

**Query parameters for `GET /api/hospitals` and `GET /api/blood-banks`:**

| Param | Description |
|---|---|
| `page` | Page number (default: 1) |
| `limit` | Results per page (default: 20, max: 100) |
| `q` | Search by name, district, state, or pincode |
| `state` | Filter by state |
| `district` | Filter by district |
| `category` | `Private` or `Public/Government` |

### Resource APIs (Authenticated)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Hospital registration |
| `POST` | `/api/auth/login` | Login — returns JWT |
| `GET` | `/api/resources/organs` | Available organs |
| `GET` | `/api/resources/equipment` | Available equipment |
| `GET` | `/api/resources/blood` | Blood inventory |
| `POST` | `/api/requests` | Create resource request |
| `GET` | `/api/notifications` | Notifications |

---

## 🗄️ Database Architecture

```
hospital_directory          ← Static government reference data
blood_bank_directory          (intentionally separate from auth table)
  ↓
hospitals                   ← Verified authenticated hospital accounts
  ↓
organs / blood / equipment  ← Live resource inventory
  ↓
requests / transactions     ← Resource demand and transfers
  ↓
notifications / audit_logs  ← Alerts and immutable activity trail
```

**Schema changes in this release:**
- `blood_bank_directory` table added
- No changes to existing live resource tables

---

## 🔭 Future Scope

- [x] OpenStreetMap / Leaflet map for hospitals with coordinates
- [x] Blood-bank directory integration
- [x] Standardized Medical Equipment Catalog integration
- [x] Standardized Organ Type integration (Phase 5)
- [ ] "Claim this hospital/blood bank" — link auth accounts to directory entries
- [ ] OpenStreetMap routing (OSRM) for ETA and actual road distance
- [ ] AI-based recommendations for best hospital match and transport routes
- [ ] Blockchain + biometric authentication for stronger security
- [ ] International organ-sharing collaboration
- [ ] Dedicated disaster and pandemic response mode
- [ ] Government analytics dashboard for healthcare planning

---

## 🤝 Contributing

Contributions are welcome! Fork the repo, create a feature branch, and open a pull request.

```bash
git checkout -b feature/your-feature-name
git commit -m "Add: your feature"
git push origin feature/your-feature-name
```

---

<div align="center">

*Built with the belief that no patient should lose time — or a life — to a broken information gap.*

</div>
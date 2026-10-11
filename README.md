# 1st Petaling Jaya Boys' Brigade Company Portal

Welcome to the central web portal for the **1st Petaling Jaya Boys' Brigade Company (1st PJ BB)**. This platform serves members, NCOs, and Officers for managing weekly company operations, resources, awards, attendance, and announcements.

---

## Overview & Core Features

The portal brings together the primary administrative and member services into a unified mobile-friendly web application:

1. **Member Hub**:
   - Member registration, authentication, and profile management.
   - Rank, squad (Alpha, Papa, Zulu, Hotel), and date-joined tracking.
   - Profile picture management backed by Supabase Storage.
2. **Uniform & Supplies Store**:
   - Responsive product card grid layout for uniform items and accessories.
   - Dynamic size selection pills, quantity steppers, and category filters.
   - Shopping cart and real-time total price computation.
   - Payment verification receipt upload (Touch 'n Go eWallet).
   - Order history and status tracking (`Pending`, `Paid`, `Ready`, `Completed`).
3. **Attendance Management**:
   - Parade (Saturday afternoon) and Band (Saturday morning) attendance tracking.
   - Automatic point calculations, late marks, and leave reasons.
   - Squad and section filtering.
   - Real-time sync to Google Sheets via Google Apps Script webhooks.
4. **Awards & Badges**:
   - Company badge catalog and criteria checklist.
   - Specialized progress tracking for **Founder's Badge** and **President's Badge**.
5. **NCO Task Board**:
   - Kanban-style task management (`To Do`, `In Progress`, `Done`).
   - Task assignment by squad and role.
6. **Announcements & Media**:
   - Company notice board with rich-text formatting and emoji reactions.
   - Photo gallery powered by cloud storage.
7. **Custom Forms**:
   - Dynamic form builder for camps, events, and special registrations.
8. **Admin Console**:
   - Centralized management for members, orders, tasks, announcements, badges, and attendance schedules.

---

## Tech Stack & Integrations

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3 (Custom styling with responsive mobile-first layout).
- **Typography**: Oswald, Roboto Condensed, Roboto (Google Fonts).
- **Backend / Database**: [Supabase](https://supabase.com/) (PostgreSQL REST API via PostgREST).
- **File & Media Storage**: Supabase Storage (`avatars` and `gallery` buckets).
- **Spreadsheet Integration**: Google Sheets via Google Apps Script web app endpoints.

---

## Database Schema & Data Architecture

The application communicates with a Supabase PostgreSQL instance:

| Table / Key | Type | Description |
| :--- | :--- | :--- |
| `bb_members` | Table | Member registry (Email, Name, Age, Section [Pre-Junior/Junior/Senior], Rank, Squad). Transitioning to privacy-first auth (TSK-005B) to eliminate IC/DOB collection. |
| `bb_orders` | Table | Uniform and merchandise purchase orders, statuses, and receipt image URLs. |
| `bb_tasks` | Table | Task board items, assignees, priorities, due dates, and statuses. |
| `bb_announcements` | Table | Company news posts, rich-text HTML content, reactions, and timestamps. |
| `bb_gallery` | Table | Gallery images, upload dates, and storage paths. |
| `bb_member_badges` | Table | Association table linking members to earned badges and requirement milestones. |
| `bb_config` | Key-Value Table | Configuration store (stores pricing, badge definitions, parade schedule, form schemas, and Sheets config). |

---

## Repository Structure (Target Architecture)

```
1stPetalingJayaBoys-Brigade-/
├── index.html                  # Clean HTML entry point and application shell
├── assets/                     # Static media and brand assets
│   ├── logo.png                # High-resolution company emblem
│   └── icons/                  # Web icons and symbols
├── css/                        # Modular stylesheet architecture
│   ├── variables.css           # Color tokens, fonts, spacing
│   ├── base.css                # Reset and core layout
│   ├── nav.css                 # Sticky top nav, bottom nav, and sidebar
│   ├── components.css          # Cards, buttons, form controls, toasts
│   └── admin.css               # Admin overlay and dashboard styling
├── js/                         # Modular client scripts (ES Modules)
│   ├── config.js               # Application configuration and constants
│   ├── api/
│   │   ├── supabase.js         # Supabase client wrapper (REST & Storage)
│   │   └── sheets.js           # Google Sheets sync webhooks
│   ├── core/
│   │   ├── session.js          # Authentication and user session state
│   │   ├── ui.js               # Toast notifications, modal helpers, router
│   │   └── editor.js           # Shared mini rich-text editor
│   ├── modules/
│   │   ├── member.js           # Member registration, login, profile
│   │   ├── orders.js           # Uniform shop, cart, TnG payment review
│   │   ├── attendance.js       # Parade & band attendance, scoring
│   │   ├── badges.js           # Badge catalog, President's badge tracker
│   │   ├── tasks.js            # Task board and assignments
│   │   ├── announcements.js    # News feed and reactions
│   │   ├── gallery.js          # Photo uploads and lightbox
│   │   ├── forms.js            # Dynamic form builder and response viewer
│   │   └── admin.js            # Master back-office controller
│   └── app.js                  # Application entry point and router
└── README.md                   # Project documentation and developer guide
```

---

## Local Development Setup

To run the portal locally:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/logistics1stpjbb/1stPetalingJayaBoys-Brigade-.git
   cd 1stPetalingJayaBoys-Brigade-
   ```

2. **Serve locally**:
   Because the modular architecture uses ES modules, serve the directory via any local static server:
   ```bash
   # Using Python 3:
   python -m http.server 8000

   # Or using Node.js / npx:
   npx serve .
   ```

3. **Open in your browser**:
   Navigate to `http://localhost:8000`.

---

## Task Tracking & Roadmap

All active development tasks, priority queues, and ownership assignments are tracked in the Google Task Sheet.

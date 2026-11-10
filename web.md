
Product: FarlinkOne — Web Dashboard
Version: 1.1
Status: Development Specification
Platform: Web Responsive (Desktop, Tablet, Mobile)
Framework: Next.js 15 (App Router, TypeScript) — frontend + backend (Route Handlers / Server Actions)
Database: SQLite (via Prisma ORM, file-based)
Authentication: Login wajib (Auth.js / NextAuth Credentials + bcrypt, session cookie)
Device: Raspberry Pi CM5 — FarLink Go / FarLink Edge
Device Agent: Python
Communication: REST API / JSON over HTTPS

FarlinkOne adalah dashboard profesional berbasis login yang digunakan untuk mengatur dan memonitor fungsi-fungsi pada perangkat Raspberry Pi (FarLink Go / Edge): status device, network test, jadwal, remote command, dan konfigurasi.

⸻

1. Product Overview

FarLink Web Dashboard adalah aplikasi web untuk mengelola, memonitor, mengonfigurasi, dan melihat hasil pengujian perangkat FarLink Go dan FarLink Edge.

Web tidak menjalankan pengujian jaringan secara langsung. Pengujian dilakukan oleh perangkat FarLink, kemudian hasilnya dikirimkan ke server.

Arsitektur:

                    FARLINK WEB
                         │
              ┌──────────┴──────────┐
              │                     │
          Dashboard             Customers
              │                     │
              │                Company
              │                     │
              │                  Device
              │                     │
              └──────────┬──────────┘
                         │
                    REST API
                         │
                  ┌──────▼──────┐
                  │   Next.js   │
                  └──────┬──────┘
                         │
                    SQLite (Prisma)
                         │
                  ┌──────▼──────┐
                  │ FarLink Go  │
                  │ / Edge      │
                  │ RaspberryPi │
                  └─────────────┘

⸻

2. Tujuan Produk

Web harus memungkinkan operator untuk:

1. Melihat status seluruh perangkat.
2. Mengelompokkan perangkat berdasarkan customer/company.
3. Melihat detail setiap perangkat.
4. Melihat hasil network test.
5. Melihat test berhasil maupun gagal.
6. Melihat grafik hasil pengujian.
7. Memfilter grafik berdasarkan sumber test.
8. Mengatur jadwal pengujian.
9. Melihat histori pengujian.
10. Mengirim perintah remote ke perangkat.
11. Menjalankan berbagai network test.
12. Menyediakan dummy data untuk demo/testing.

⸻

3. User Role

Untuk versi pertama dapat menggunakan satu role:

Administrator

Memiliki akses:

* Dashboard
* Customers
* Company
* Device
* Monitoring
* Test
* Schedule
* Test History
* Configuration
* Dummy Data

Struktur role dapat diperluas pada versi berikutnya.

⸻

4. Struktur Navigasi Web

FarLink
│
├── Dashboard
│
├── Customers
│   │
│   ├── Company A
│   │   ├── Device 001
│   │   ├── Device 002
│   │   └── Device 003
│   │
│   ├── Company B
│   │   ├── Device 004
│   │   └── Device 005
│   │
│   └── Company C
│
├── Tests
│   ├── Speed Test
│   ├── MTR
│   ├── DIG
│   ├── CURL
│   └── TCP Port
│
├── Test History
│
├── Schedules
│
└── Settings

⸻

5. Dashboard

Dashboard merupakan halaman pertama setelah login.

5.1 Summary

Tampilkan:

Total Customers
10
Total Devices
45
Online
40
Offline
5

Kemudian:

Tests Today
1,250
Successful
1,190
Failed
60

⸻

5.2 Device Status

Tampilkan ringkasan:

ONLINE
40
OFFLINE
5
WARNING
2

Status perangkat berasal dari heartbeat FarLink Agent.

⸻

6. Customers

Menu Customers merupakan struktur utama untuk mengorganisasi perangkat.

Struktur:

Customers
│
├── Company A
│   ├── FarLink-001
│   ├── FarLink-002
│   └── FarLink-003
│
├── Company B
│   ├── FarLink-004
│   └── FarLink-005

Requirement ini berasal langsung dari catatan pengembangan: customer harus dikelompokkan berdasarkan company, kemudian setiap company memiliki daftar device. FarLink_Dashboard_Notes.docx

⸻

7. Company Management

Administrator dapat:

* Create company
* Edit company
* View company
* Delete/deactivate company
* Melihat jumlah device
* Melihat status device

Contoh:

Company A
Devices: 5
Online: 4
Offline: 1
[View Devices]

⸻

8. Device Management

Setiap device mempunyai:

Device ID
Device Name
Serial Number
Device Type
Company
IP Address
MAC Address
Firmware Version
Agent Version
Status
Last Seen

Contoh:

FarLink-001
Company       : Demo Company
Type          : FarLink Go
IP Address    : 192.168.1.20
Status        : ONLINE
Last Seen     : 27 Sep 2026 08:15:21
Agent Version : 1.0.3

⸻

9. Device Detail

Ketika device dipilih, tampilkan halaman:

Device Detail
│
├── Overview
├── Network
├── Test Results
├── Graph
├── History
├── Schedule
└── Configuration

⸻

10. Device Overview

Menampilkan kondisi terkini.

Device
FarLink-001
Status
ONLINE
Gateway
192.168.1.1
REACHABLE
Internet
CONNECTED
Last Heartbeat
08:15:23

Jika gateway bermasalah:

Gateway
192.168.1.1
UNREACHABLE

Status Gateway Router yang selalu muncul Unreachable merupakan salah satu item yang harus diperbaiki. FarLink_Dashboard_Notes.docx

⸻

11. Latest Test Result

Tampilkan hasil test terbaru.

LATEST TEST
Speed Test
Download
95.20 Mbps
Upload
19.80 Mbps
Latency
12 ms
Status
SUCCESS
Trigger
Scheduled
27 Sep 2026
08:15:23

Tanggal dan waktu harus selalu terlihat bersama hasil upload/download. FarLink_Dashboard_Notes.docx

⸻

12. Test Trigger

Setiap test wajib memiliki sumber/trigger.

Enum:

MANUAL
REMOTE
SCHEDULED

MANUAL

Test berasal dari tombol fisik FarLink.

REMOTE

Test diperintahkan melalui dashboard/web.

SCHEDULED

Test dijalankan otomatis berdasarkan schedule.

Requirement ini diperlukan agar hasil tombol fisik juga masuk ke grafik dan dapat dibedakan dari remote/scheduled test. FarLink_Dashboard_Notes.docx

⸻

13. Test Result

Semua test harus memiliki status:

SUCCESS
FAILED

Test gagal tidak boleh dibuang.

Contoh:

08:00  Speed Test   Scheduled   SUCCESS
08:15  Speed Test   Scheduled   SUCCESS
08:30  Speed Test   Scheduled   FAILED
08:45  Speed Test   Scheduled   SUCCESS

Untuk FAILED:

Status:
FAILED
Error:
Connection timeout

Requirement ini secara eksplisit meminta failed test tetap dicatat agar kegagalan dapat dianalisis. FarLink_Dashboard_Notes.docx

⸻

14. Database Test Result

Minimal struktur:

test_results
id
device_id
test_type
trigger_type
status
started_at
completed_at
duration
result_data
error_message
created_at

test_type

SPEED
MTR
DIG
CURL
TCP_PORT

trigger_type

MANUAL
REMOTE
SCHEDULED

status

SUCCESS
FAILED

⸻

15. Combined Graph

Halaman device memiliki grafik gabungan.

Contoh:

Download / Upload
Mbps
100 ┤       ●
 80 ┤   ●       ●
 60 ┤ ●
 40 ┤
 20 ┤   ○   ○
  0 └────────────────────
     08  09  10  11  12

Grafik menampilkan data berdasarkan waktu.

⸻

16. Graph Filter

Tambahkan filter:

Trigger Type
☑ Manual
☑ Remote
☑ Scheduled

User dapat:

All
Manual
Remote
Scheduled

Requirement ini berasal dari permintaan filter combined graph berdasarkan jenis trigger. FarLink_Dashboard_Notes.docx

⸻

17. Compact Test History

History dibuat ringkas agar tidak memenuhi layar.

Contoh:

TIME    TRIGGER     TYPE       RESULT
08:15   Scheduled   Speed      95/20 Mbps
08:00   Scheduled   Speed      93/19 Mbps
07:45   Scheduled   Speed      FAILED
07:30   Remote      Speed      97/21 Mbps
07:15   Manual      Speed      94/20 Mbps

Dokumen meminta format history yang compact untuk menghemat ruang. FarLink_Dashboard_Notes.docx

⸻

18. Schedule Management

Administrator dapat mengatur periodic testing.

Pilihan interval:

OFF
15 Minutes
1 Hour
24 Hours

Requirement interval tersebut tercantum dalam catatan pengembangan. FarLink_Dashboard_Notes.docx

Contoh:

Device:
FarLink-001
Schedule:
ON
Interval:
15 Minutes
Last Test:
08:15
Next Test:
08:30

⸻

19. Remote Test

Administrator dapat menjalankan test dari web.

Contoh:

Device: FarLink-001
[ Run Speed Test ]

Web mengirim command:

WEB
 ↓
API
 ↓
FarLink Agent
 ↓
Speed Test
 ↓
Result
 ↓
API
 ↓
Database
 ↓
Dashboard

Trigger disimpan sebagai:

REMOTE

⸻

20. Manual / Physical Button

Ketika user menekan tombol fisik FarLink:

Physical Button
      ↓
FarLink Agent
      ↓
Run Test
      ↓
Send Result
      ↓
Backend
      ↓
Database
      ↓
Graph

Trigger:

MANUAL

Hasilnya harus muncul di:

* Latest Result
* History
* Combined Graph
* Filter Manual

⸻

21. Network Tests

Web harus mendukung monitoring hasil dari:

21.1 Speed Test

Download
Upload
Latency
Jitter
Packet Loss

21.2 MTR

Untuk path tracing.

21.3 DIG

Untuk DNS resolution timing.

21.4 CURL

Untuk HTTP/HTTPS response time.

21.5 TCP Port

Untuk mengetahui apakah port TCP tertentu dapat dijangkau.

Kelima kelompok test tersebut mengikuti daftar pada dokumen, termasuk MTR, DIG, CURL, dan TCP socket. FarLink_Dashboard_Notes.docx

⸻

22. Test Detail

Setiap hasil dapat dibuka.

Contoh:

Test Detail
Device:
FarLink-001
Test:
CURL
Target:
https://example.com
Trigger:
Remote
Status:
SUCCESS
Response:
200
Response Time:
124 ms
Started:
08:20:01
Completed:
08:20:01

Untuk test gagal:

Status:
FAILED
Error:
Connection timeout

⸻

23. Dummy Data

Sediakan fasilitas khusus untuk demo/testing.

Minimal:

Demo Company
│
├── FarLink Demo 001
├── FarLink Demo 002
├── FarLink Demo 003
├── FarLink Demo 004
└── FarLink Demo 005

Dokumen meminta satu company dengan 5 dummy devices yang dapat menghasilkan data untuk grafik interval 15 menit maupun 1 jam. FarLink_Dashboard_Notes.docx

⸻

24. Dummy Data Generator

Saya sarankan halaman:

Settings
└── Demo / Dummy Data

Form:

Company
[ Demo Company ]
Devices
[ 5 ]
Test Type
[ Speed Test ]
Interval
[ 15 Minutes ▼ ]
Duration
[ 24 Hours ]
Status
[ Random ▼ ]
[ Generate Data ]

Hasilnya otomatis masuk database sehingga dashboard dapat digunakan untuk demo tanpa harus menunggu perangkat melakukan test sungguhan.

⸻

25. API Architecture

Web menggunakan REST API.

Contoh:

/api/auth
/api/customers
/api/companies
/api/devices
/api/devices/{id}
/api/devices/{id}/status
/api/test-results
/api/test-results/{id}
/api/devices/{id}/tests
/api/devices/{id}/schedule
/api/devices/{id}/commands

Untuk agent:

/api/devices/register
/api/agent/heartbeat
/api/agent/config
/api/agent/commands
/api/agent/test-results

⸻

26. Command Flow

Untuk remote test:

Web
 │
 │ POST /commands
 ▼
Backend
 │
 │ command
 ▼
Device
 │
 │ execute
 ▼
Test Engine
 │
 │ result
 ▼
Backend
 │
 ▼
Database
 │
 ▼
Web

Web tidak menganggap command berhasil hanya karena command berhasil dikirim.

Ada dua status:

COMMAND SENT

kemudian:

TEST SUCCESS
atau
TEST FAILED

⸻

27. Gateway Monitoring

Gateway harus mempunyai status:

REACHABLE
UNREACHABLE
UNKNOWN

Informasi:

Gateway IP
Latency
Status
Last Check

Contoh:

Gateway
192.168.1.1
REACHABLE
Latency: 1.2 ms
Checked: 08:15:23

⸻

28. Device Online/Offline

Device menggunakan heartbeat.

Contoh:

Last Heartbeat
08:15:23

Backend menentukan status:

ONLINE
OFFLINE

Dashboard harus memperlihatkan Last Seen.

⸻

29. Security

Minimal:

* Login authentication
* Password hashing
* Session/token authentication
* API authentication untuk device
* Device token
* HTTPS
* Input validation
* Authorization
* Rate limiting untuk API
* Audit log untuk command penting

Device tidak boleh dapat mengakses API sebagai device lain.

⸻

30. Responsive Design

Web harus dapat digunakan pada:

Desktop

Prioritas utama untuk monitoring.

Tablet

Untuk monitoring dan administrasi.

Mobile

Untuk:

* melihat status device
* melihat latest result
* melihat histori
* menjalankan remote test

⸻

31. Non-Functional Requirements

Performance

Dashboard harus dapat menampilkan data tanpa mengambil seluruh histori sekaligus.

Gunakan:

Pagination
Date Range
Limit
Aggregation

untuk histori dan grafik.

Reliability

Jika device gagal melakukan test:

FAILED

tetap disimpan.

Data Integrity

Setiap hasil harus mempunyai:

Device
Timestamp
Test Type
Trigger
Status

⸻

32. MVP Scope

Untuk tahap pertama saya sarankan jangan langsung membuat seluruh fitur sekaligus.

MVP 1 — Core

* Login
* Dashboard
* Company
* Device
* Device status
* Heartbeat
* Latest result
* Test history
* SUCCESS/FAILED
* Trigger type

⸻

MVP 2 — Monitoring

* Combined graph
* Graph filter
* Timestamp
* Compact history
* Gateway status
* Remote test

⸻

MVP 3 — Automation

* Schedule ON/OFF
* 15 menit
* 1 jam
* 24 jam
* Next test
* Last test

⸻

MVP 4 — Network Test

* Speed Test
* MTR
* DIG
* CURL
* TCP Port

⸻

MVP 5 — Demo

* Dummy company
* 5 dummy devices
* Dummy result generator
* 15-minute data
* Hourly data

⸻

33. Acceptance Criteria

Customer

* Admin dapat membuat company.
* Device dapat ditempatkan pada company.
* Device tampil di bawah company yang benar.

Device

* Device dapat register.
* Device mengirim heartbeat.
* Web menampilkan online/offline.
* Last seen tersedia.

Test

* Manual test tercatat.
* Remote test tercatat.
* Scheduled test tercatat.
* Test SUCCESS tercatat.
* Test FAILED tercatat.
* Error message tersedia untuk failed test.

Graph

* Manual muncul.
* Remote muncul.
* Scheduled muncul.
* Bisa filter berdasarkan trigger.
* Timestamp benar.

Schedule

* 15 menit bekerja.
* 1 jam bekerja.
* 24 jam bekerja.
* Schedule dapat diaktifkan/nonaktifkan.

Network Test

* MTR dapat dijalankan oleh device.
* DIG dapat dijalankan oleh device.
* CURL dapat dijalankan oleh device.
* TCP port test dapat dijalankan oleh device.
* Semua hasil masuk histori.

Dummy Data

* 5 dummy devices tersedia.
* Data 15 menit dapat dibuat.
* Data 1 jam dapat dibuat.
* Dummy data muncul di graph.

⸻

34. Prioritas Development

Saya akan menjadikan urutan development seperti ini:

PHASE 1
Database
   ↓
Device
   ↓
Heartbeat
   ↓
Test Result
   ↓
SUCCESS / FAILED
PHASE 2
Customers
   ↓
Company
   ↓
Devices
   ↓
Device Detail
PHASE 3
Latest Result
   ↓
History
   ↓
Combined Graph
   ↓
Trigger Filter
PHASE 4
Remote Test
   ↓
Schedule
   ↓
15m / 1h / 24h
PHASE 5
MTR
DIG
CURL
TCP Port
PHASE 6
Dummy Data
   ↓
5 Devices
   ↓
15m / 1h
   ↓
Demo Graph
PHASE 7
UI Polish
   ↓
Graph sesuai video
   ↓
Responsive
   ↓
Performance

⸻

35. Technology Stack (Detail)

| Layer | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | React 19, Vanilla CSS / CSS Modules (design tokens), font Inter |
| Chart | Recharts (combined graph, filter trigger) |
| Icon | lucide-react |
| ORM | Prisma |
| Database | SQLite (file `.db`) |
| Auth | Auth.js (NextAuth v5) Credentials provider, bcrypt, JWT session cookie (httpOnly) |
| Validation | Zod |
| Device API Auth | Bearer device token (hash disimpan di DB) |
| Process (prod) | `next build` + `next start` via PM2 / systemd |

Struktur folder:

web/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/        ← DI-COMMIT ke Git
│   └── seed.ts            ← admin default + dummy data
├── data/                  ← lokasi file SQLite (DI-IGNORE Git)
│   └── .gitkeep
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (dashboard)/dashboard, customers, devices, tests, history, schedules, settings
│   │   └── api/ (auth, devices, test-results, agent/*)
│   ├── components/
│   ├── lib/ (db.ts, auth.ts, validators.ts)
│   └── middleware.ts      ← proteksi route login
├── .env.example           ← DI-COMMIT (template)
├── .env.development       ← lokal, DI-IGNORE
├── .env.production        ← server, DI-IGNORE
└── .gitignore

⸻

36. Pemisahan Database Development & Production (SQLite)

Tujuan: file database development dan production TIDAK PERNAH saling menimpa saat `git push` / `git pull`.

Aturan:

1. File SQLite tidak pernah masuk Git. Yang masuk Git hanya schema dan migration.
2. Nama file berbeda per environment:
   * Development: `data/farlinkone.dev.db`
   * Production : `data/farlinkone.prod.db` (atau path di luar repo, mis. `/var/lib/farlinkone/farlinkone.db`)
3. Path ditentukan oleh `DATABASE_URL` di file env masing-masing (tidak di-commit).

.env.example (commit):

DATABASE_URL="file:../data/farlinkone.dev.db"
AUTH_SECRET="ganti-dengan-random-string"
AUTH_URL="http://localhost:3000"
ADMIN_EMAIL="admin@farlink.local"
ADMIN_PASSWORD="ganti-password"

.env.development (lokal):

DATABASE_URL="file:../data/farlinkone.dev.db"

.env.production (server Raspberry/VPS):

DATABASE_URL="file:/var/lib/farlinkone/farlinkone.prod.db"

.gitignore wajib berisi:

# SQLite
data/*.db
data/*.db-journal
data/*.db-wal
data/*.db-shm
*.sqlite
*.sqlite3
!data/.gitkeep

# Env
.env
.env.local
.env.development
.env.production
.env*.local
!.env.example

# Next
.next/
node_modules/

Workflow:

| Kegiatan | Development | Production |
|---|---|---|
| Ubah schema | `npx prisma migrate dev --name <nama>` | — |
| Commit | `schema.prisma` + folder `migrations/` | — |
| Setelah pull | `npx prisma migrate dev` | `npx prisma migrate deploy` |
| Seed | `npx prisma db seed` (admin + dummy) | Seed admin saja (sekali) |
| Reset | `npx prisma migrate reset` boleh | DILARANG |

Catatan:
* Production hanya menggunakan `migrate deploy` (tidak pernah `migrate dev`/`reset`/`db push`) agar data tidak hilang.
* Aktifkan mode WAL SQLite (`PRAGMA journal_mode=WAL`) untuk performa baca/tulis bersamaan dari agent dan dashboard.
* Backup production: cron harian `sqlite3 farlinkone.prod.db ".backup backup-YYYYMMDD.db"`, disimpan di luar repo.

⸻

37. Login & Authentication

Halaman Login:

* Field: Email, Password, tombol "Sign In", opsi "Remember me".
* Pesan error generik ("Email atau password salah").
* Rate limit percobaan login (mis. 5x / 15 menit per IP).
* Logo FarlinkOne, layout split (branding kiri, form kanan), dark mode.

Aturan:

* Semua route `/dashboard/**` dan `/api/**` (kecuali `/api/auth/**` dan `/api/agent/**`) diproteksi `middleware.ts`.
* `/api/agent/**` menggunakan device token, bukan session user.
* Password disimpan dengan bcrypt (cost ≥ 10).
* Admin default dibuat oleh seed dari `ADMIN_EMAIL` / `ADMIN_PASSWORD`; wajib ganti password saat login pertama.
* Logout menghapus session cookie.
* Halaman Settings → Users: tambah/nonaktifkan user, ganti password.

Tabel `users`: id, name, email (unique), password_hash, role (ADMIN), is_active, last_login_at, created_at, updated_at.

⸻

38. Pengaturan Fungsi Raspberry Pi dari Dashboard

Dashboard mengatur perangkat melalui command queue (device melakukan polling `/api/agent/commands`).

Command yang didukung:

| Command | Fungsi |
|---|---|
| RUN_TEST | Jalankan Speed / MTR / DIG / CURL / TCP Port |
| SET_SCHEDULE | Atur interval OFF / 15m / 1h / 24h |
| UPDATE_CONFIG | Ubah target test, gateway, server speedtest |
| REBOOT | Restart Raspberry Pi |
| RESTART_AGENT | Restart service FarLink Agent |
| SYNC_TIME | Sinkronisasi NTP |
| GET_LOGS | Ambil log agent terbaru |

Status command: PENDING → SENT → RUNNING → SUCCESS / FAILED / TIMEOUT.
Command berisiko (REBOOT, UPDATE_CONFIG) wajib konfirmasi dialog dan tercatat di audit log.

Tabel `device_commands`: id, device_id, type, payload (JSON), status, created_by, created_at, sent_at, completed_at, result, error_message.

⸻

39. Desain UI Dashboard (Profesional)

Prinsip: bersih, data-dense, konsisten, mudah dipindai operator.

Layout:

┌────────────┬──────────────────────────────────────────┐
│  SIDEBAR   │  TOPBAR: breadcrumb · search · user menu  │
│  Logo      ├──────────────────────────────────────────┤
│  Dashboard │  KPI Cards (Customers/Devices/Online/...) │
│  Customers │  ┌────────────────────┐ ┌──────────────┐ │
│  Devices   │  │ Combined Graph     │ │ Device Status│ │
│  Tests     │  └────────────────────┘ └──────────────┘ │
│  History   │  ┌──────────────────────────────────────┐ │
│  Schedules │  │ Compact Test History (table)         │ │
│  Settings  │  └──────────────────────────────────────┘ │
└────────────┴──────────────────────────────────────────┘

Design tokens:

| Token | Nilai |
|---|---|
| Background | #0B1220 (dark) / #F7F9FC (light) |
| Surface/Card | #111A2E, border #1F2A44, radius 12px |
| Primary | #3B82F6 → gradient #6366F1 |
| Success / ONLINE | #22C55E |
| Warning | #F59E0B |
| Danger / FAILED / OFFLINE | #EF4444 |
| Text | #E5E7EB / muted #94A3B8 |
| Font | Inter (UI), JetBrains Mono (IP, MAC, log) |

Komponen:

* Sidebar collapsible + ikon, active state jelas.
* KPI card dengan angka besar, delta, dan sparkline.
* Status badge berwarna (ONLINE/OFFLINE/WARNING, SUCCESS/FAILED, MANUAL/REMOTE/SCHEDULED).
* Tabel dengan sorting, filter, pagination, sticky header.
* Chart dengan tooltip timestamp lengkap dan toggle filter trigger.
* Toast notifikasi untuk hasil command, skeleton loading, empty state.
* Dark mode default + toggle light mode.
* Micro-animation halus (hover card, transisi 150–200ms), tanpa berlebihan.
* Auto-refresh status device tiap 15–30 detik.

Acceptance:

* Tanpa login, semua halaman dashboard redirect ke `/login`.
* `git pull` di production tidak mengubah/menimpa file database.
* Dev dan prod menggunakan file SQLite yang berbeda.
* Tampilan konsisten di desktop, tablet, dan mobile.
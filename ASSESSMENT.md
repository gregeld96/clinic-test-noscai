# Technical Assessment — Multi-Tenant Clinic Scheduling & Conflict Detection

> **Goal:** Design and implement the core scheduling service for a multi-clinic practice management system using **Node.js** (backend) and **React** (frontend).
> **Focus:** Correct data modeling, robust conflict detection, clean APIs, and a small but functional UI.

---

## 🧭 Scenario

NoscAi runs a multi-tenant EHR/PVS. Each tenant is a medical clinic with its own doctors, patients, rooms, and devices. You’ll build the **scheduling core** that prevents double bookings, returns availability, and exposes a minimal UI for booking.

Assume **timezone = Europe/Berlin** for all date/time examples.

---

## ✅ Requirements

### 1) Backend (Node.js)

#### 1.1 Database schema

Model at minimum:

* `tenants` (for clarity)
* `doctors`, `patients`, `services`, `rooms`, `devices`
* `appointments`
* Optional helpers: `working_hours`, `breaks`, `service_resources` (if services need specific rooms/devices)
* Every domain table must include `tenant_id` for **multi-tenant isolation**.

**Expectations**

* 3NF-ish normalization where sensible.
* Indices that support lookups by tenant + time ranges (e.g., `(tenant_id, doctor_id, starts_at)`).
* Constraints for data integrity (FKs, unique, check constraints).
* Optional but welcome: partitioning strategy (e.g., by month or by tenant) with rationale.

Deliver a **DDL** (SQL) plus a short rationale (why each constraint/index/partition).

#### 1.2 Booking logic

* No overlapping appointments for the **same doctor**, **room**, or **device**.
* Respect:

  * **Service duration** (e.g., 30 min)
  * **Buffers** before/after (per service)
  * **Working hours** (per doctor and/or clinic)
  * **Breaks** (per doctor/room/clinic)
* Concurrency safety: two concurrent requests must not create conflicts (transactional checks or database-level constraints).

#### 1.3 Availability search

* Input: `{ service_id, doctorIds?: number[], dateRange: { from, to } }`
* Output: **the next 3 available time slots** (start + end) that satisfy:

  * resource requirements (doctor, room, device)
  * duration + buffers
  * working hours + breaks
* If `doctorIds` omitted → search across all doctors supporting the service.

#### 1.4 API

Expose REST endpoints (documented in **OpenAPI/Swagger** or similar):

* `POST /api/appointments` — create booking
* `DELETE /api/appointments/:id` — cancel booking
* `GET /api/availability` — search availability (see payload below)
* `GET /api/doctors/:id/schedule?from=...&to=...` — list doctor’s appointments for calendar view

**Auth can be simplified**: a header like `X-Tenant-Id` is enough. Enforce tenant isolation server-side.

#### 1.5 Scale assumptions

* **50k bookings/day**, peak traffic **09:00–11:00**.
* Show how your schema/indexes/queries support this (explain in design note).
* Reasonable performance targets (e.g., availability search <300 ms on warm cache for a 1–7 day window) — justify your choices.

---

### 2) Frontend (React)

Build a minimal app that:

* Displays a **calendar view** (day/week is fine) for a selected doctor.
* Allows **creating a booking**:

  1. Select service + (optional) doctor
  2. Call **availability API** and show the next 3 slots
  3. Confirm to create appointment
* Consumes your backend APIs. Keep it simple and clean.

Tech notes:

* Any React stack is fine (Vite/Next.js/CRA). TypeScript preferred.
* Basic styling (no need for pixel-perfect); usability matters.

---

## 🔌 API Contracts (example)

### Create Appointment

```http
POST /api/appointments
X-Tenant-Id: 42
Content-Type: application/json
```

```json
{
  "doctor_id": 101,
  "patient_id": 555,
  "service_id": 7,
  "room_id": 12,
  "device_ids": [3],
  "starts_at": "2025-09-15T09:30:00+02:00"
}
```

**201 Created**

```json
{
  "id": 9876,
  "starts_at": "2025-09-15T09:30:00+02:00",
  "ends_at": "2025-09-15T10:15:00+02:00",
  "buffer_before_min": 5,
  "buffer_after_min": 10
}
```

**409 Conflict**
Return what collided (e.g., doctor or room) and the conflicting appointment id/time.

---

### Cancel Appointment

```http
DELETE /api/appointments/9876
X-Tenant-Id: 42
```

**204 No Content**

---

### Availability Search

```http
GET /api/availability?service_id=7&from=2025-09-15T08:00:00%2B02:00&to=2025-09-16T18:00:00%2B02:00&doctor_ids=101,102
X-Tenant-Id: 42
```

**200 OK**

```json
{
  "slots": [
    { "doctor_id": 101, "room_id": 12, "device_ids": [3], "start": "2025-09-15T09:30:00+02:00", "end": "2025-09-15T10:15:00+02:00" },
    { "doctor_id": 101, "room_id": 12, "device_ids": [3], "start": "2025-09-15T10:30:00+02:00", "end": "2025-09-15T11:15:00+02:00" },
    { "doctor_id": 102, "room_id": 9,  "device_ids": [],  "start": "2025-09-15T11:00:00+02:00", "end": "2025-09-15T11:30:00+02:00" }
  ],
  "limit": 3
}
```

---

## 🧩 Conflict Rules (explicit)

An **appointment** occupies:

* `doctor_id` **\[required]**
* `room_id` **\[required]** (unless you justify optional in design note)
* `device_ids[]` **\[optional]** (0..n)

A slot is **available** iff:

* No overlap with any existing appointment for **any** of those resources; use **closed-open** intervals `[start, end)` to avoid edge collisions.
* Fits entirely within the doctor’s working hours for that day.
* Does not intersect configured **breaks**.
* Includes `buffer_before_min` and `buffer_after_min` around the core duration.

> Tip: Enforce at least one **database-level guard** (e.g., exclusion constraints or unique keys on computed time buckets) to prevent race conditions; supplement with transactional checks.

---

## 🗄️ Data Model Hints (illustrative, not prescriptive)

* `appointments(id, tenant_id, doctor_id, patient_id, room_id, starts_at, ends_at, created_at, updated_at)`
* `services(id, tenant_id, name, duration_min, buffer_before_min, buffer_after_min, requires_room boolean, requires_device boolean)`
* `service_devices(service_id, device_id)` — which device types a service needs
* `devices(id, tenant_id, name, device_type)`
* `working_hours(id, tenant_id, doctor_id, weekday, start_local_time, end_local_time)`
* `breaks(id, tenant_id, resource_type enum('doctor','room','device'), resource_id, starts_at, ends_at)`
* Composite indexes like:

  * `idx_appt_tenant_doctor_time (tenant_id, doctor_id, starts_at)`
  * `idx_appt_tenant_room_time (tenant_id, room_id, starts_at)`
  * `idx_appt_tenant_device_time (tenant_id, starts_at)` plus join table
* Consider **RLS**/policies or a service-layer guard. Explain your choice.

---

## 🧪 Testing Expectations

* Unit tests for:

  * Conflict detection
  * Availability search edge cases (borders, buffers, breaks)
* Integration test for:

  * Two concurrent booking attempts for the same slot → only one succeeds
* Seed script with a **small realistic dataset** for manual QA.

---

## 🖥️ Frontend Expectations

* Simple doctor selector + day/week calendar view.
* “New Booking” flow:

  1. Pick service + doctor(s) + date range
  2. Show top 3 availability slots
  3. Confirm creates appointment and refreshes the calendar
* Handle and display **409 Conflict** errors gracefully.

---

## 🔒 Non-Functional Requirements

* **Tenant isolation** enforced server-side (don’t trust client).
* **Time zones:** store timestamps in UTC; convert at the edge for display (assume Europe/Berlin).
* **Idempotency**: creating the same booking twice should not duplicate (e.g., `Idempotency-Key` header optional).
* **Documentation**: OpenAPI/Swagger with example requests/responses.
* **Clean code**: consistent linting/formatting; README with setup/run instructions.

---

## 🚀 Getting Started (suggested, not mandatory)

* **Backend**: Node.js (TypeScript preferred), Express/Fastify/NestJS. Use PostgreSQL (recommended).
* **Frontend**: React + your preferred tooling (Vite/Next.js). TypeScript preferred.
* Provide `docker-compose.yml` for Postgres if convenient.

---

## 📦 Deliverables

* **Node.js backend** (with tests).
* **React frontend** (minimal but functional).
* **Database schema (DDL)** with rationale (constraints, indices, partitioning).
* **Design note (1–2 pages)**: decisions, trade-offs, algorithm/data-structure complexity, and scale considerations.
* **OpenAPI/Swagger** docs exposed at `/docs` or similar.
* **Seed data** for quick verification.

---

## 🧮 Evaluation Rubric (100 pts)

* **Data modeling & multi-tenant isolation (20 pts)**
  Solid normalization, correct FKs, thoughtful indexes, clear tenant guards.
* **Conflict detection correctness (25 pts)**
  Handles overlaps, buffers, breaks, race conditions; deterministic behavior.
* **Availability search quality & performance (20 pts)**
  Returns valid slots quickly; sensible algorithm; justified complexity.
* **API design & docs (15 pts)**
  Clear, consistent, well-documented endpoints and error handling.
* **Frontend UX (10 pts)**
  Simple, usable calendar + booking flow; clean state handling.
* **Code quality & tests (10 pts)**
  Readable, maintainable, with meaningful unit/integration tests.

> **Stretch goals** (bonus, up to +10 pts total):
>
> * RLS policies in Postgres with per-tenant enforcement
> * Exclusion constraints on time ranges (e.g., `tstzrange`)
> * Caching or precomputation for availability
> * Support for recurring working hours exceptions (holidays)

---

## 📫 Submission

* Provide a GitHub repository (or archive) with:

  * `README.md` (how to run)
  * `backend/` and `frontend/` directories
  * `db/ddl.sql` and `db/seed.sql`
  * `DESIGN.md` (1–2 pages)
  * OpenAPI JSON/YAML or route-generated docs

Include sample cURL or an `.http` file for quick testing.

---

## 📌 Assumptions You May Make

* One clinic == one tenant (no cross-tenant bookings).
* A service generally requires exactly one doctor and one room; devices optional.
* You may keep auth simple; the focus is scheduling correctness & design.

---

## 🕒 Suggested Timebox

Target **6–10 hours**. It’s okay to leave TODOs—call them out in the design note and explain what you’d do next and why.

---

**Good luck!** We value correctness, clarity, and thoughtful trade-offs over “big frameworks”.

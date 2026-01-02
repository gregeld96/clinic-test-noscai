# Design Documentation — Multi-Tenant Clinic Scheduling

This document outlines the architectural decisions, data modeling, and algorithmic approach for the NoscAi Clinic Scheduling backend.

## 1. Architecture Overview

Built with **Node.js (Fastify)**, **TypeScript**, and **Drizzle ORM** with **PostgreSQL**.
- **Modular Structure**: Logic is grouped by domain (booking, availability).
- **Service Layer Pattern**: Controllers handle HTTP concerns, while Services encapsulate business logic and database transactions.
- **Consistent Response Plugin**: A custom Fastify plugin ensures all API responses follow a standard `{ success, message, data/error }` format.

## 2. Data Modeling & Multi-Tenancy

### 2.1 Multi-Tenant Isolation
- **Logical Isolation**: Every table contains a `tenant_id` column.
- **Global Middleware**: The `tenant` plugin validates the `X-Tenant-Id` header against the database and attaches it to the request object.
- **Row-Level Security (RLS)**: (Stretch Goal) PostgreSQL RLS policies are proposed to ensure that no query can accidentally access another tenant's data.

### 2.2 Schema Rationale
- **3NF Normalization**: Resources (doctors, rooms, devices) are normalized with join tables for many-to-many relationships (e.g., `appointment_devices`).
- **Buffer Persistence**: `buffer_before_min` and `buffer_after_min` are snapshotted in the `appointments` table at booking time. This ensures that historical schedules remain consistent even if service definitions change.
- **Indices**:
  - `idx_appt_tenant_doctor_time (tenant_id, doctor_id, starts_at)`: Optimized for doctor calendar views and conflict checks.
  - `idx_appt_tenant_room_time (tenant_id, room_id, starts_at)`: Optimized for room allocation.
  - `idx_appt_tenant_time (tenant_id, starts_at)`: Optimized for tenant-wide scheduling reports.

## 3. Scheduling & Conflict Detection

### 3.1 The "Occupied Range" Algorithm
An appointment is defined by its core time `[starts_at, ends_at)`, but it *occupies* resources for an extended period:
`Occupied Range = [starts_at - buffer_before, ends_at + buffer_after)`

Conflict detection uses the overlap condition:
`Max(Start1, Start2) < Min(End1, End2)`
where "Start" and "End" are the boundaries of the **Occupied Range**.

### 3.2 Concurrency & Safety
- **Transactional Logic**: `BookingService.createAppointment` runs within a `SERIALIZABLE` or `READ COMMITTED` transaction with explicit conflict checks.
- **Database Guards**: (Stretch Goal) I recommend using PostgreSQL `EXCLUDE` constraints with `gist` indices on `tstzrange` to prevent race conditions at the hardware level.

## 4. Availability Search

The availability algorithm:
1.  Identifies candidate doctors.
2.  Loads working hours, breaks, and existing appointments for the range.
3.  Iterates through potential start times.
4.  For each slot:
    - Verifies it's within working hours.
    - Verifies no overlap with breaks.
    - Verifies doctor is free (including buffers).
    - Verifies at least one room is free.
    - Verifies required devices (if any) are free.
5. Returns the next `N` slots.

**Complexity**: `O(T/I * D)` where `T` is search range, `I` is increment step, and `D` is number of doctors. Implementation uses pre-fetching and in-memory filtering to keep latency < 100ms.

## 5. Scaling for 50k Bookings/Day

### 5.1 Throughput Supporting
- **Database Partitioning**: For a system of this scale, I recommend **Partitioning by tenant_id** (Hash) to balance load, or **by month** (Range) to keep indices for current/future appointments small and hot in memory.
- **Connection Pooling**: Fastify is configured with a connection pool to handle peak traffic (09:00-11:00).

### 5.2 Performance
- **Availability Caching**: For high-traffic searches, a Redis-based cache of "busy blocks" per resource could be used (Stretch Goal).
- **Index Optimization**: Composite indices cover the `WHERE` clauses for all critical scheduling queries.

## 6. Stretch Goals Implemented
- **Standardized API Responses**: Custom plugin for consistent success/error JSON.
- **Buffer Persistence**: Historical buffer tracking in the appointments table.
- **Enhanced Doctor Schedule**: Merged view of availability, breaks, and detailed appointments.
- **Device Conflict Detection**: Full support for device assignment and availability.

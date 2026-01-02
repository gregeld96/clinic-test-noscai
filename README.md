# NoscAi Clinic Scheduling System

This project implements the technical assessment for the multi-tenant clinic scheduling system.

## Prerequisites
- Node.js (v20+)
- Docker (for PostgreSQL)

## Setup

1. **Install Dependencies**
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **Start Database**
   ```bash
   docker-compose up -d
   ```
   ```bash
   docker-compose up -d
   ```
   *If you do not have Docker, please provide a PostgreSQL connection string in `backend/.env` as `DATABASE_URL`.*

3. **Initialize Database Schema**
   Run the following command to create tables for the first time:
   ```bash
   cd backend
   npm run db:push
   ```
   *This uses Drizzle Kit to push the schema definition to the database.*

3. **Seed Data**
   Run the seed script to populate tenants (City Central Clinic), doctors, and services:
   ```bash
   cd backend
   npm run db:seed
   ```

4. **Start Backend**
   ```bash
   cd backend
   npm run dev
   ```
   Server runs on `http://localhost:3000`.

5. **Start Frontend**
   ```bash
   cd frontend
   npm run dev
   ```
   Open `http://localhost:5173`.

## Architecture Details
See [DESIGN.md](./DESIGN.md) for architectural decisions and data model explanations.
See [ASSESSMENT.md](./ASSESSMENT.md) for original requirements.

## Testing

This project includes a comprehensive test suite using **Vitest**.

### Unit Tests
Covers conflict detection, availability logic, buffers, and breaks.
```bash
cd backend
npm run test src/modules/availability/service.test.ts
npm run test src/modules/booking/service.test.ts
```

### Integration Test
Verified concurrent booking attempts with database exclusion constraints.
```bash
cd backend
npm run test test/integration/concurrency.test.ts
```

### Run All Tests
```bash
cd backend
npm run test -- --run
```

---

## Troubleshooting
- **Relation "tenants" does not exist**: This means the database schema hasn't been applied. Run `npm run db:push` in the `backend` folder.

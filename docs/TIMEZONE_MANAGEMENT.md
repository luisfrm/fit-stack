# 🕒 Isomorphic Timezone Management

In Fit-Stack, time precision isn't just a technical detail; it's a critical business rule. If a gym operating in a non-UTC timezone receives a payment at 11:30 PM local time, that income must appear in **today's** report, not tomorrow's due to the UTC offset.

This document explains how we've centralized and optimized date handling across the entire ecosystem.

---

## 🏗️ Architecture: "A Single Source of Truth"

Historically, systems query the timezone on every request or depend on the server's configuration (UTC). We've implemented an **Isomorphic and Decoupled** model.

### 1. The Organization as an Anchor
The timezone (e.g., `Europe/Madrid`, `America/Bogota`) is stored directly in the `organization` table in the database. 
- **Benefit:** Each branch or gym operates in its own time reality regardless of where our servers are located.

### 2. Enriched Session
Through **Better Auth** plugins, the `timezone` field is injected into the user session. 
- **Benefit:** Any Server Component or API Route has instant access to the local timezone without making a single extra database query.

### 3. "Time-Agnostic" Services
Our core services (`FinanceService`, `ReportsService`, `DashboardService`) have been refactored to **not depend on the database** to fetch the current time.
- **Implementation:** They receive the `timezone` as a required parameter.
- **Benefit:** Easier Unit Testing and faster execution speed.

---

## 📊 Accuracy in Reports (Pro-Level SQL)

To ensure that revenue and attendance charts are accurate, we move the conversion logic directly to the database using Drizzle and Postgres:

```typescript
// Example of grouping by local date in the Repository
sql`(${table.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date`
```

### Why do we do this?
1. **Consistency:** We avoid the "day jump" in late-night reports.
2. **Performance:** Postgres processes thousands of records and groups them by the correct local date in a single atomic operation.
3. **Transparency:** What the cashier sees on their clock is exactly what the owner sees in their statistics.

---

## 🚀 Developer Benefits

- **Fewer Bugs:** Common "yesterday vs today" errors in date filters are eliminated.
- **Clean Code:** Services are pure functions that process data based on an injected timezone.
- **Speed:** We remove the need for redundant queries to configuration tables in every report.

---

> [!TIP]
> **Golden Rule:** Whenever you create a new service that handles reports or analytics, make sure to receive the `timezone` from the controller and pass it to the SQL aggregation functions.

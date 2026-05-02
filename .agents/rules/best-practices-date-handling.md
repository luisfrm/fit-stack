---
name: best-practices-date-handling
description: Backend-centric timezone policy to ensure accounting and membership consistency.
---

# Date & Timezone Handling

Protect the integrity of your accounting and membership data by following our **Backend-Centric Timezone Policy**.

## 1. The "Raw String" Policy
The Frontend must not move dates based on the user's local PC clock.
- **Rule**: Always send dates as raw strings (`YYYY-MM-DD`) to the API.
- **Prohibited**: Do not use `new Date().toISOString()` or `new Date()` for manual dates (e.g., membership expiry, operation date) on the client.
- **Audit**: Automatic dates (like `createdAt`) are the only exception and are set by the server.

## 2. Server-Side Situating
The Backend is the only layer responsible for placing a date in time.
- **Storage**: All timestamps are stored as `TIMESTAMPTZ` (UTC absolute).
- **Parsing**: Use `settingsService.parseLocalDate(organizationId, dateStr)` to convert a `YYYY-MM-DD` string to a UTC Date corresponding exactly to **midnight** in the organization's timezone.

## 3. Database Aggregation
SQL queries for charts or grouping must be timezone-aware to prevent "Day Jumps."
- **Rule**: Always use `AT TIME ZONE` logic in aggregations.
- **Pattern**: `DATE_TRUNC('day', date_col AT TIME ZONE 'UTC' AT TIME ZONE ${orgTimezone})`.
- **Output**: Return string labels (using `TO_CHAR`) from the repository to the frontend for immutable rendering.

## 4. Distinction of Dates
Never mix these purposes:
- **Membership (`startDate`, `endDate`)**: Pure local logic for door access.
- **Accounting (`paymentDate`)**: When the money moved. User-editable.
- **Audit (`createdAt`)**: The real moment the record was created. Non-editable.

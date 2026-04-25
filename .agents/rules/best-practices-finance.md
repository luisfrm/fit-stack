---
name: best-practices-finance
description: Multi-currency logic, exchange rate handling, and pricing standards.
---

# Finance & Multi-currency

Manage complex financial data with accuracy by following our dynamic currency and pricing standards.

## 1. Dynamic Currency System
Never assume a specific currency (e.g., USD or VES) in your code logic.
- **Rule**: Use the `currency` property attached to the business object (Plan, Subscription, Payment).
- **Settings**: Available currencies are defined per organization in the Settings module.

## 2. Moneda Base (Primary Currency)
Every organization has a primary currency for calculation purposes.
- **Normalización**: For cross-currency analytics, the system uses the `exchangeRateApplied` stored at the moment of the transaction to normalize values into the primary currency.

## 3. Exchange Rate Policy
- **Capture**: Always store the exchange rate used at the exact moment of the payment. This creates an immutable snapshot of the value.
- **Override**: If the organization allows it, staff can manually edit the rate during payment registration to match real-world bank variances.

## 4. Cent-based Calculations
Avoid floating-point math errors.
- **Rule**: Store and process all money amounts as **integers** representing cents (e.g., $10.00 is stored as `1000`).
- **Formatting**: Use the `ValueConverter` utility in the frontend to display these integers correctly according to the organization's `currencyFormat` setting.

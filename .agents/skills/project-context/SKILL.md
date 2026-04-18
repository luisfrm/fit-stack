---
name: project-context
description: Functional and business overview of the Fit-Stack ecosystem. Explains the "what" and "why" of every module to ensure architectural and business alignment.
---

# Fit-Stack: Project Context & Module Overview

This skill provides the conceptual framework for the Fit-Stack ecosystem, a multi-tenant SaaS designed for the Gym and Fitness industry, primarily serving the Venezuelan market.

## 1. Project Vision
Fit-Stack is more than a CMS; it's a gym management engine. It solves the complexity of multi-currency billing (USD/VES), member retention, and automated physical access control.

### Core Architecture Concepts
- **Multi-tenancy**: Every gym is an `Organization`. Data isolation is strictly enforced via `organizationId`.
- **B2B SaaS Model**: The system consists of a "Platform" layer (SaaS Admins) and a "CMS" layer (Gym Admins).

---

## 2. Module Breakdown: Intent & Purpose

### **Members**
- **Intention**: Centralized identity management for gym clients.
- **Why**: To maintain a clean record of who is authorized to use the facilities and track their historical behavior/preferences.

### **Membership Plans**
- **Intention**: Commercial product catalog.
- **Why**: To define the "what is being sold." It allows gyms to configure flexible durations (Daily, Weekly, Monthly) and precise pricing in a base currency (usually USD).

### **Subscriptions**
- **Intention**: Temporal access control logic.
- **Why**: To link a Member to a Plan. It handles the **Cumulative Expiration Logic** (renewing a subscription adds time to the current end date if the member is still active), ensuring no day of paid access is lost.

### **Payments**
- **Intention**: Financial audit and sanity.
- **Why**: To track cash flow. In the Venezuelan context, it's critical to capture dynamic metadata (bank trial hashes, reference numbers, screenshots) to validate manual transfers. It prevents "duplicate registrations" by blocking new subscriptions if a payment is still `processing`.

### **Platform (Super Admin)**
- **Intention**: SaaS lifecycle management.
- **Why**: To allow the Fit-Stack owner to create new gyms (Organizations), manage their platform tiers, and monitor overall system health without entering individual gym databases.

### **Staff & Trainers**
- **Intention**: Human Resources and Operations.
- **Why**: To distinguish between those who manage the business (Staff) and those who deliver the service (Trainers). This separation allows for specific payroll or scheduling logic in the future.

### **Classes**
- **Intention**: Service diversification and scheduling.
- **Why**: To manage group activities (Crossfit, Yoga, etc.) that aren't part of the general gym floor, allowing for attendance tracking and capacity management.

### **Content**
- **Intention**: Communication and Dynamic UI.
- **Why**: To allow administrators to update dynamic sections of the dashboard or future mobile/web portals without requiring code changes.

### **Settings**
- **Intention**: Localization and Personalization.
- **Why**: Each gym is unique. This module handles specific localizations (Timezone, Currency formats) and branding (Colors, Logos via dynamic OKLCH injection).

---

## 3. The Bridge App (Hardware Integration)
- **Intention**: Physical security breach.
- **Why**: A Python/Flet application that runs locally at the gym’s entrance. It communicates with the API to validate a member's QR/Biometric data against their active subscription, effectively turning "billing data" into "physical access."

## 4. Business Rules Summary
1. **Multi-currency**: Systems always think in a base currency but allow payment in local currency (VES) via real-time exchange rate calculation.
2. **Atomic Invoicing**: Subscriptions and Payments are created as an atomic unit to ensure financial and temporal data never desync.
3. **Strict Isolation**: No gym can ever see another gym's data. Everything is scoped to the `activeOrganizationId` in the session.

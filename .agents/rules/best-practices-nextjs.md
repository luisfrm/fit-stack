---
name: best-practices-nextjs
description: High-performance Next.js 15+ patterns, Server Components (RSC), and state management.
---

# Next.js Patterns & Performance

Maximize speed and SEO by leveraging the full power of Next.js 15+ architecture.

## 1. Server Components First (RSC)
- **Assumption**: Every component is a Server Component by default. 
- **Client Directive**: Use `"use client"` only at the leaf nodes or where interactivity (hooks, event listeners) is required.
- **Fetching**: Perform data fetching as high as possible in the tree using Server Components to reduce the JS bundle sent to the client.

## 2. State as URL
Avoid hidden state. If a state changes the content of the page and should be shareable or survives a reload, put it in the URL.
- **Pattern**: Use `?page=2`, `?search=foo`, or `?filter=active` instead of `useState`.
- **Sync**: Use `useSearchParams` and `useRouter` to update these values programmatically.

## 3. Async Params (Next.js 15)
In Next.js 15, `params` and `searchParams` in both Route Handlers and Server Components are **Promises**.
- **Rule**: You MUST define them as `Promise<...>` and `await` them before access.

## 4. Middleware & Boundary
The `proxy.ts` (middleware) is the gatekeeper.
- **Scope**: Use it for early session validation, CORS, and header manipulation.
- **Rule**: Do not put business logic or heavy data fetching here.

## 5. Modern Navigation
- **Avoid `window.location`**: Use `useRouter` for client-side navigation.
- **Server Sync**: Use `router.refresh()` to tell Next.js to re-fetch Server Components data without a hard reload.

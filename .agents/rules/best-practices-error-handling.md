---
name: best-practices-error-handling
description: Standardized feedback mechanisms, mutation safety, and error propagation.
---

# Error Handling & User Feedback

Deliver a reliable experience by ensuring every action is accounted for and communicated to the user.

## 1. Silent Failure Prohibition
Never use `console.log()` to hide an error in production. If an operation fails, the user must be notified.

## 2. Standard Mutation Pattern
Wrap every mutation (Create, Edit, Delete) in a robust `try/catch` block.
- **Backend**: Throw clear errors with meaningful messages.
- **Frontend**: Catch the error and pass the server's message to the Toast.

```typescript
try {
  await mutation.mutateAsync(data);
  toast.success("Record created successfully");
} catch (error: any) {
  toast.error(error.message || "Something went wrong. Please try again.");
}
```

## 3. UI Indicators
- **Loading States**: Buttons must show a `loading` spinner and be disabled during an operation to prevent duplicate submissions.
- **Skeletons**: Use `<Skeleton>` components during high-level page fetching to prevent layout shifts.

## 4. Validation
- **Frontend**: Validate inputs early (Zod) to prevent unnecessary network calls.
- **Backend**: Re-validate everything. Server-side validation is the final law. Propagate validation errors clearly so the user knows which field needs fixing.

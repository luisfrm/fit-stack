# Corrección posterior — motor del PDF (`react-pdf` → `pdf-lib`)

> Anexo a [[FS-0001]] (cerrada). No modifica `plan.md`, `task.md` ni `phases/`: documenta un cambio posterior del motor de render, resuelto en [[FS-0004]].

## Qué cambió

- El render del comprobante pasó de `@react-pdf/renderer` a `pdf-lib`: `apps/jobs-worker/src/receipt-pdf.tsx` → `apps/jobs-worker/src/receipt-pdf.ts` (sin JSX, JS puro, sin WASM, compatible con workerd). Se mantiene lazy (dynamic import en `receipt.handler.ts`) para no engordar el path de emails.
- `@react-pdf/renderer` se eliminó de `apps/jobs-worker/package.json`; `react`/`@types/react` se conservan (los necesita `resend`/`@react-email/render`).

## Por qué

- `@react-pdf/renderer` → `yoga-layout` instancia WASM desde un buffer en runtime, prohibido en Cloudflare Workers (`CompileError: Wasm code generation disallowed by embedder`); por eso fallaba el 100 % de los renders en producción. Referencias: cloudflare/workerd#3345, diegomura/react-pdf#2757.

## Qué no cambió

- La firma `renderReceiptPdfBytes(data, format)` y el nombre del módulo `receipt-pdf` no cambiaron; tampoco el contrato de 3 estados, el barrido ni los gates de email definidos en [[FS-0001]].

## Nota sobre menciones históricas

- Las referencias a `receipt-pdf.tsx` / `@react-pdf/renderer` que quedan en `plan.md`, `task.md` y `phases/` de [[FS-0001]] describen el estado al cierre de la task y se dejan intactas a propósito. El estado vigente vive en [[FS-0004]].

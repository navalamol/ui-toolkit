# Network Monitor — `__LDS_NETWORK_ENABLED__`

**Source:** `src/core/network.js`  
**Panel tab:** Network  
**Data globals:** `window.__LDS_NETWORK_LOG__`

---

## What it is

Patches `window.fetch` and `XMLHttpRequest` to capture every outbound request: URL, method, status code, duration, response size, and whether it was slow, large, or an error. Supports a decoder plugin so protocol-encoded request bodies (e.g., Falcor paths, GraphQL) can be decoded into readable objects.

---

## The problem it solves

The DevTools Network tab is powerful but ephemeral — it resets on navigation, can't be exported in structured form, and can't easily be included in a bug report. You want to know: how many requests did this page make, which ones failed, which ones were slow, and which were larger than expected — in a form you can attach to a ticket.

Additionally: custom protocols (Falcor, GraphQL over POST, proprietary binary) show as opaque bodies in the Network tab. The decoder plugin extension point turns those into readable objects in the panel.

---

## How to enable

```js
// Standalone
window.__LDS_NETWORK_ENABLED__ = true;

// Or via master flag
window.__LDS_DEBUG__ = { network: true };
```

`LdsNetwork.init()` is called once from `LitDebugMixin` on the first element mount. Subsequent calls are no-ops. The `fetch` and `XHR` patches apply globally for the session.

> **Note:** Must be enabled before any fetch/XHR calls if you want to capture early requests. Reload after enabling for a clean session.

---

## How it works

**Fetch patch:** Replaces `window.fetch` with a wrapper that records `t0 = performance.now()` before the call, then in the `.then` handler reads `performance.now() - t0` for duration and `response.headers.get('content-length')` for size. Errors (rejected promises) are also captured with `isError: true`.

**XHR patch:** Patches `XMLHttpRequest.prototype.open` (to capture method + URL) and `XMLHttpRequest.prototype.send` (to start timing + attach a `loadend` listener). The `loadend` event fires for both success and failure.

**Thresholds (hard-coded):**
- Slow: `durationMs > 2000`
- Large: `responseSizeKB > 512`

**Decoder plugin:**
```js
LdsNetwork.registerDecoder(fn)
// fn(rawUrl: string, body: string | null) → decodedObject | null
```
If a decoder is registered, `_resolveDecoded(rawUrl, body)` is called for every request. The Syndigo integration registers `FalcorDecoder` via `custom/ui-platform/index.js`. The decoded result is stored in the log entry's `decoded` field.

---

## The data shape

```js
window.__LDS_NETWORK_LOG__
// [{ url, fullUrl, method, status, durationMs, responseSizeKB, ts, isError, isSlow, isLarge, type, decoded, error? }]
// Capped at 200 entries.

window.__LDS_NETWORK_LOG__[0]
// {
//   url:            "/api/products?page=1",       // short URL (pathname + truncated query)
//   fullUrl:        "https://app.example.com/...", // full original URL
//   method:         "GET",
//   status:         200,
//   durationMs:     1823,
//   responseSizeKB: 48,
//   ts:             "2026-10-06T10:14:32.110Z",
//   isError:        false,    // true if status >= 400 or status === 0
//   isSlow:         true,     // true if durationMs > 2000
//   isLarge:        false,    // true if responseSizeKB > 512
//   type:           "fetch",  // "fetch" or "xhr"
//   decoded:        null      // populated by decoder plugin if registered
// }

// Error case (network failure, no response)
// {
//   status:   0,
//   isError:  true,
//   error:    "Failed to fetch",
//   decoded:  null
// }
```

---

## Panel: Network tab

The Network tab displays the log as a filterable table:

- **Status filter:** all / errors / slow / large
- **Search:** filters by URL substring
- **Expand row:** shows full URL, request timing, response size, and `decoded` if available

The **Summary tab** shows net error count as a stat chip, contributing to the page health score (errors deduct 10 points).

---

## Reliability

**High:** `fetch` duration and XHR duration are measured with `performance.now()` — they are the actual wall-clock time from the request being sent to the response being received (or the error occurring).

**Medium:** `responseSizeKB` from `content-length` header. This header is:
- Absent on many compressed responses (gzip/brotli content-length reflects compressed size)
- Absent on streaming responses
- Absent on CORS requests that don't expose the header

In practice, `responseSizeKB` is `null` or 0 for most modern API responses. It's reliable for static asset fetches.

**XHR timing** measures from `.send()` to `loadend`, which includes the browser's own internal buffering. For large responses, this may slightly overstate duration vs. "time to first byte."

---

## Limitations

**Thresholds are hard-coded.** 2000ms slow threshold and 512KB large threshold cannot be changed. On apps with inherently slow or large responses (video streams, large data exports), these flags are noisy.

**No request body capture.** The `body` from `fetch` options is passed to the decoder for decoding, but the raw request body is not stored in the log entry. If you need to see what was sent (not just decoded), inspect `window.__LDS_NETWORK_LOG__[n]` — `request` is not there.

**No cancellation tracking.** Aborted requests (AbortController) don't add a "cancelled" entry. The request simply never resolves its Promise, so no log entry is created.

**Same-origin restriction for `content-length`.** CORS responses need `Access-Control-Expose-Headers: Content-Length` for the header to be readable. Without it, `responseSizeKB` is 0.

**Fetch polyfill conflict.** If your app uses a `fetch` polyfill that replaces `window.fetch` before `init()` runs, the patch wraps the polyfill, not the native implementation. This usually works fine.

---

## Falcor calls: use the Falcor tab instead

If your app uses the Syndigo Falcor integration (`custom/ui-platform`), Falcor calls appear in the Network tab decoded but still as flat rows — you can't see which entity types or IDs were requested, why there are 10 identical `entityData` calls, or how they relate to each other.

For Falcor, the **Falcor tab** provides a purpose-built view: burst grouping (one user action = one group), path anatomy (entity types, IDs, fields per call), duplicate path detection, and search session linking.

```js
// Enable both:
window.__LDS_NETWORK_ENABLED__ = true;  // provides the data
window.__LDS_FALCOR_VIEW__ = true;      // shows Falcor tab
// reload → navigate → open panel → Falcor tab
```

See [15 — Falcor Tab](15-falcor-tab.md) for full documentation.

---

## What can improve

1. **Configurable thresholds.** `window.__LDS_NETWORK_SLOW_MS__` and `window.__LDS_NETWORK_LARGE_KB__` analogous to `__LDS_SLOW_API_MS__`.
2. **Request body storage.** An opt-in to store the request body string (not just pass it to the decoder).
3. **Cancellation tracking.** Detect AbortController signals and log cancelled requests.
4. **Request grouping.** Group requests by URL pattern (e.g., `/api/products/*`) to show average latency per endpoint rather than per-request noise.
5. **Waterfall view.** Show requests as a horizontal timeline with start times, like DevTools Network's waterfall, to visualize request concurrency.

---

## How it makes life easier

- **Included in every bug report.** The exported JSON report includes `network: [...]`. When debugging a user-reported issue, you can see exactly which requests fired, in what order, and which failed.
- **Decoder plugin.** For teams using Falcor or custom protocols, the `decoded` field in each log entry shows the readable semantic request — not the wire format. This transforms "I see a POST to /model.json with an opaque body" into "I see a request for `products[0..47].name`."
- **Error count in Summary.** The net error count in the Summary tab's stat row gives an immediate health signal without opening the Network tab.

---

## What you'll see in the Network tab

The Network tab shows a filterable table of all captured requests:

```
Filter: [All ▼]  Search: _______________

  URL                          method  status  duration  size
  /api/products?page=1         GET     200     1823ms    48KB   ← amber (slow)
  /api/recommendations         GET     404     82ms      —      ← red (error)
  /static/chunk-8fa3.js        GET     200     45ms      220KB
  /model.json                  POST    200     340ms     12KB
```

- Amber row = slow (`durationMs > 2000ms`)
- Red row = error (`status >= 400` or `status === 0`)
- Click a row to expand: full URL, decoded body (if decoder registered), response size

The **Summary tab** shows a "Net errors" stat chip — click it to jump to the Network tab pre-filtered to errors.

---

## Reading the results

| What you see | What it means |
|---|---|
| status: 0 + isError: true | Network failure — CORS error, offline, or request was aborted |
| Duplicate URLs | A component is requesting the same data multiple times — missing cache or dedup logic |
| Many requests in a short window | A request waterfall — some may be unintentionally sequential |
| Large size but fast duration | Data is big but CDN is efficient — consider whether all of it is needed |
| Slow but successful | Backend is the bottleneck — switch to Slow API Monitor if it's an API method call |

---

## Step-by-step: auditing what a page requests

1. `window.__LDS_NETWORK_ENABLED__ = true` → **reload** (must be set before the first fetch/XHR)
2. Navigate to the page and let it fully load
3. Open panel → **Network tab** → start with "All" filter
4. Scan for red rows (errors) — these are bugs
5. Switch to "Slow" filter — anything > 2000ms that's user-blocking needs investigation
6. Look for duplicate URLs — same URL appearing multiple times indicates a caching or dedup problem
7. For the full log:
   ```js
   window.__LDS_NETWORK_LOG__
     .filter(e => e.isError)
     .map(e => `${e.method} ${e.url} → ${e.status}`)
   ```

---

## Sanity check

```js
// Confirm requests are being captured:
window.__LDS_NETWORK_LOG__.length
// 0 after page load → flag was set after requests fired → reload

// Check for any errors:
window.__LDS_NETWORK_LOG__.filter(e => e.isError)
```

---

## Complete example

```js
// 1. Enable before page load
window.__LDS_NETWORK_ENABLED__ = true;

// 2. Navigate to a product listing page

// 3. Check the log
window.__LDS_NETWORK_LOG__
  .filter(e => e.isError)
  .map(e => `${e.method} ${e.url} → ${e.status} (${e.error || 'HTTP error'})`)
// ["GET /api/recommendations → 404", "POST /api/track → 0 (Failed to fetch)"]

// 4. Check for slow requests
window.__LDS_NETWORK_LOG__
  .filter(e => e.isSlow)
  .sort((a, b) => b.durationMs - a.durationMs)
// [{ url: "/api/products", durationMs: 2340, status: 200 }]

// 5. Panel → Network tab → filter "errors" → expand row for full details
```

# Component Inspector — `__LDS_INSPECTOR__`

**Source:** `src/core/inspector.js`  
**Panel tab:** None — output goes to clipboard + console  
**Data globals:** `window.createComponentWithData()`

> **No panel tab.** The Inspector has no dedicated tab. Output is written to the **clipboard** (and mirrored to the browser console). Paste the clipboard contents into a text editor or directly into Claude Code after capturing.

---

## What it is

A hover-to-snapshot tool. When enabled, hovering over any tracked component reveals a `📸 <tag-name>` button. Clicking it captures the component's full state — declared properties, private fields, and a replay hint — and copies it to the clipboard as JSON.

This is for "what is this component's state right now?" — the runtime equivalent of reading a component's source props.

---

## The problem it solves

You see a bug in a rendered component. You open the source file. You don't know which instance is affected, what its current prop values are, or what private state it accumulated during the session.

You could: add `console.log(this)` to `updated()`, rebuild, reload, reproduce. Or open DevTools → Elements → find the element → read properties manually from the DOM tree. Both are slow and fragile.

The Inspector captures all of it — public props, private `_*` fields, app context, and a ready-to-use HTML snippet with mock setup code — with one click.

---

## How to enable

```js
// Enable the hover badge on all tracked elements
window.__LDS_INSPECTOR__ = true;

// Programmatic snapshot — no hover needed
window.createComponentWithData('rock-grid');       // by CSS selector
window.createComponentWithData(el);                // by element reference
```

Can be toggled at any time without reload. The hover listeners are always attached (from `LitDebugMixin.connectedCallback`); the badge only appears when `__LDS_INSPECTOR__` is truthy.

---

## How it works

`attach(el)` adds `mouseover` and `mouseleave` listeners. On hover, a singleton `<button>` overlay is positioned at the top-right of the element's bounding rect and labeled `📸 <tagname>`.

On click, `_buildSnapshot(el)` runs:

```
_buildSnapshot(el)
  ├── inputProps    — reads all keys from el.constructor.properties (Lit static properties)
  │                  with live values from the element instance
  ├── privateState  — reads all own properties starting with _ (single underscore)
  │                  that aren't framework internals (__* prefix) or declared properties
  ├── context       — calls window.__LDS_CONTEXT_GETTER__(el) if defined
  └── replayHint    — builds HTML snippet + mock setup code from inputProps + privateState
```

Values are serialized with `_trimVal()` which:
- Truncates strings to 300 chars (configurable)
- Caps arrays at 5 items (configurable)
- Caps object keys at 20 (configurable)
- Replaces DOM nodes with `[DOMNode <tagname>]`
- Replaces circular references with `[Circular]`
- Caps recursion at depth 4 (configurable)

The snapshot JSON is written to the clipboard via `navigator.clipboard.writeText()`. On failure (clipboard unavailable), it's logged to console instead.

---

## The snapshot shape

```js
{
  element:    "rock-grid",
  filePath:   "src/components/rock-grid/rock-grid.js",
  capturedAt: "2026-10-06T10:30:00.000Z",

  inputProps: {
    // All declared static properties with live values
    productId:  "PRD-123",
    data:       [{ id: 1, name: "Widget" }, "...+47 more"],
    loading:    false,
    filters:    { category: "electronics", price: { min: 0, max: 500 } }
  },

  privateState: {
    // Own properties starting with _
    _selectedRows:   [1, 4, 7],
    _sortColumn:     "name",
    _sortDirection:  "asc",
    _lastScrollY:    240
  },

  context: {
    // Whatever window.__LDS_CONTEXT_GETTER__(el) returns (app-specific)
  },

  replayHint: {
    html: "<rock-grid\n  productId=\"PRD-123\"\n></rock-grid>",
    mockSetup: [
      "// 1. Set object/array props:",
      "el.data = snapshot.inputProps['data'];",
      "el.filters = snapshot.inputProps['filters'];",
      "",
      "// 2. Restore captured private state (bypasses API calls):",
      "el._selectedRows = snapshot.privateState['_selectedRows'];",
      "el._sortColumn = snapshot.privateState['_sortColumn'];"
    ].join("\n")
  }
}
```

---

## Customising the inspector

```js
// Custom file path resolver (default: src/components/<tag>/<tag>.js)
window.__LDS_TAG_TO_FILE__ = tag => `src/elements/${tag}/${tag}.js`;

// Custom context getter — attach app-specific state (e.g., store data)
window.__LDS_CONTEXT_GETTER__ = el => ({
  storeState: window.__myStore__?.getStateFor(el.componentId),
  routeParams: window.__router__?.currentParams,
});

// Serialization options
window.__LDS_INSPECTOR_OPTS__ = {
  maxDepth:      6,    // default 4
  maxArrayItems: 10,   // default 5
  maxObjKeys:    30,   // default 20
  maxStrLen:     500,  // default 300
};
```

---

## Console output

Every snapshot also prints a grouped console log:

```
▶ [LdsInspector] <rock-grid>
  Input Props    { productId: "PRD-123", data: [...], loading: false, filters: {...} }
  Private State  { _selectedRows: [1,4,7], _sortColumn: "name", ... }
  Context        { storeState: {...} }
  Replay HTML    "<rock-grid\n  productId="PRD-123"\n></rock-grid>"
  Mock Setup     "// 1. Set object/array props:\nel.data = ..."
```

---

## Reliability

**High:** Property reads are direct — `el[key]` at the moment of capture. No caching, no approximation. What you see is the live value.

**Medium:** `privateState` captures `Object.getOwnPropertyNames(el)` filtered to `_*` keys. If a component stores private state on a nested object (e.g., `this._state = { value: ... }`) rather than as direct instance properties, the top-level key appears but only the trimmed summary of the nested value.

**Known edge:** The button positioning can clip at viewport edges on very small elements or elements near the edge of the screen. The button is repositioned to `Math.min(window.innerWidth - 160, rect.right - 155)` which handles most cases but not all.

---

## Limitations

**Mixin dependency.** Hover listeners are only attached to elements using `LitDebugMixin`. Third-party elements are not covered.

**Clipboard availability.** `navigator.clipboard.writeText()` requires a secure context (HTTPS or localhost) and user permission. In environments where it's unavailable, the snapshot is printed to console instead.

**No panel tab.** The snapshot exists only in the clipboard/console. There is no history of previous snapshots, no diff between two snapshots of the same element. Every capture overwrites the clipboard.

**One capture at a time.** The overlay button is a singleton — only one element is "hovered" at a time. You cannot capture two elements simultaneously.

**`__LDS_INSPECTOR_OPTS__` changes apply to the next capture, not retroactively.** Already-captured snapshots in the clipboard are not re-trimmed.

---

## What can improve

1. **Snapshot history in the panel.** A list of the last N snapshots with timestamps and diffs between them.
2. **Diff view between two snapshots of the same element.** Take snapshot A (before interaction), take snapshot B (after), diff them — shows which props and private state changed.
3. **Deep link to file in IDE.** Clicking the file path in the console output should open the file in the configured IDE. The file path is there; the link action is not.
4. **Shadow DOM traversal for nested element capture.** Currently captures only the hovered element, not its slotted children or shadow-root elements.
5. **Export all snapshots as a session replay.** Sequence of snapshots across a session could serve as a test fixture generator.

---

## How it makes life easier

- **No rebuild needed to see component state.** Hover, click, paste — the full state is in the clipboard in under two seconds.
- **Replay hint** tells you exactly how to recreate the component in isolation, including which object props to set programmatically (can't be set as HTML attributes) and which private state to restore to skip API calls in a test.
- **Pair with Pinpoint.** When Pinpoint surfaces `<rock-grid>` as a problem, capture a snapshot to understand what state it was in when the issue occurred. Paste both the snapshot and the Fix Table entry to Claude Code.

---

## What you'll see

When `__LDS_INSPECTOR__ = true`, hovering over any tracked component shows a small button at its top-right corner:

```
┌─────────────────────────────────────┐
│                        📸 rock-grid │  ← click this
│   (component content)               │
└─────────────────────────────────────┘
```

Clicking it:
1. Copies full snapshot JSON to clipboard (silent — no modal or popup)
2. Prints a grouped log to the console:

```
▶ [LdsInspector] <rock-grid>
    Input Props     { productId: "PRD-123", data: [...], loading: false }
    Private State   { _selectedRows: [1,4,7], _sortColumn: "name" }
    Context         { storeState: {...} }
    Replay HTML     "<rock-grid productId="PRD-123"></rock-grid>"
    Mock Setup      "el.data = snapshot.inputProps['data']; ..."
```

Paste the clipboard JSON into Claude Code, a test fixture, or a bug report to share the exact component state at the time of the issue.

---

## Step-by-step: understanding what a component's state is right now

1. `window.__LDS_INSPECTOR__ = true` (no reload needed — toggle anytime)
2. Hover over the component on the page → a `📸 <tag-name>` button appears at its top-right
3. Click the button — clipboard is updated, console group expands
4. Paste clipboard contents into your editor to see `inputProps` (what the parent passed in) and `privateState` (what the component accumulated internally)
5. Use `replayHint.html` to recreate the component in a test — it includes the exact attribute values
6. Use `replayHint.mockSetup` to set object/array props programmatically (can't be set as HTML attributes)

**When the button doesn't appear:** The element doesn't use `LitDebugMixin`. Capture programmatically instead:
```js
window.createComponentWithData('rock-grid')
```

---

## Sanity check

```js
// Test capture without hovering:
const snap = window.createComponentWithData('rock-grid');
snap.inputProps    // all declared Lit properties with live values
snap.privateState  // all own properties starting with _

// If snap is undefined: 'rock-grid' is not in the DOM, or LitDebugMixin is not installed
document.querySelector('rock-grid')  // null → not on this page
```

---

## Complete example

```js
// 1. Enable
window.__LDS_INSPECTOR__ = true;

// 2. (Optional) wire app context
window.__LDS_CONTEXT_GETTER__ = el => ({
  userId: window.__app__?.currentUser?.id
});

// 3. Hover over <rock-grid> in the page → click 📸 rock-grid
// Clipboard now contains full snapshot JSON

// 4. Or: capture programmatically from console
const snap = window.createComponentWithData('rock-grid');
// snap.replayHint.html → paste into a test fixture
// snap.inputProps → understand what data the component received
// snap.privateState._selectedRows → see current internal selection state

// 5. Use replayHint in a test
// HTML:      <rock-grid productId="PRD-123"></rock-grid>
// then in JS: el.data = snap.inputProps.data;
```

# Quiet Element — design and implementation plan

New independent Chrome MV3 extension, Japanese UI, no ChappyBlock files touched.
Plain JavaScript, no production dependencies or build transformation. Chrome 120+.

## Design
- Popup and context menu start a top-frame picker through activeTab + scripting.
- Optional exact-host http/https access is granted explicitly in popup for automatic revisits. Dynamic registered content scripts run at document_start on permitted hosts with saved rules.
- Service worker serializes storage mutations; validates sender, host, selector and limits. Data stays in storage.local. No network calls.
- Picker uses isolated Shadow DOM controls, visual hover rectangle, click interception, preview, separate save/cancel and Escape. No save on page clicks. Restore on cancel and storage error.
- Selectors prefer unique stable IDs, stable class combinations, then bounded ancestor paths; positional fallback is labeled fragile. Reject document roots, structural landmarks and huge containers. Runtime only hides a selector with one safe match; ambiguous selectors fail open.
- Popup lists current host rules; management page lists all hosts. Per-rule, per-host and global toggles, individual deletion, confirmed global reset, explicit permission revocation.
- Scope: exact hostname, all paths and ports; subdomains separate. Frames and shadow interiors excluded. Cosmetics only, no request blocking.

## Implementation tasks
1. Write failing real-browser selector and picker tests, and storage boundary tests. Verify red.
2. Implement core selector/safety and storage model; implement worker permission registration and serialized messaging.
3. Implement content UI and fail-open runtime; add popup and full management UI.
4. Verify browser integration with controlled Chrome API adapter; verify native MV3 if available. Record limitations honestly.
5. Write Japanese README, manual test checklist and verification report; package sources, tests and extension into ZIP; verify ZIP entries and checksums.

## Review focus
Unsafe broad selectors; preview rollback; permission denial/revocation; concurrent writes; SPA/dynamic DOM ambiguity; restricted pages; hostile text rendering.

## Execution record
Native implementation in a new work directory, delivered under outputs. The user supplied full requirements and requested completed ZIP delivery. No existing project or Git branch is changed.

Completed all five implementation tasks. Final standard suite: 27 passing tests. Added document-scoped USER-origin CSS to beat inline important styles without altering site-owned inline attributes. Independent review found escaped selector punctuation rejection; fixed with a regression test and reviewed again. Native extension loading remains environment-blocked, explicitly recorded in TEST-REPORT.md. No publish or installation into the user's browser was performed.

## Revision 1.1.0
User reported picker startup failure and requested tracing AdBlock on GitHub. Read AdBlock's loader, wizard, click watcher, overlay, element chain and blacklist UI sources. CDP-based installation and real toolbar action in a separate temporary Chrome profile reproduced insecure-HTTP randomUUID failure and options sender.tab rejection. Fixed both. Ordered dependency injection now explicitly invokes a versioned controller and checks a startup ACK. Transparent input surface with hit testing supports iframe outer elements. Native failure-and-retry test prevents poisoned initialization locks. Standard suite now has 28 tests; 5 additional native tests cover the formerly missing boundary. TEST-REPORT.md supersedes the earlier native-test limitation. Existing user browser profiles and ChappyBlock remain untouched.

# Agent Notes

## Project Shape

- This is a vanilla Vite app. Keep runtime code dependency-free unless there is a clear, tested reason to add a dependency.
- `src/main.js` is the browser entrypoint and should stay small. App wiring lives in `src/app.js`; renderer internals live under `src/vanilla/`.
- Markdown tables are the source of truth. Chart edits must persist back into the markdown textarea and `localStorage`.
- Task dependencies are stored in the task table `dependencies` column and drive parent/connector behavior.

## TDD Expectations

- Start behavior changes with failing Vitest tests. Prefer pure unit tests for date/layout math and jsdom integration tests for markdown/UI persistence.
- Keep tests focused on user-visible behavior: drag, resize, sort, modal edits, dependencies, subtasks, storage, and build output.
- Do not add Playwright for normal validation. Use jsdom unit/integration tests unless a browser-only issue cannot be represented otherwise.
- After meaningful edits, run the focused test first, then `npm test` and `npm run build`.

## Renderer Lessons

- Use the timeline helpers for all date-to-pixel and pixel-to-date conversions. Avoid ad hoc date math in UI handlers.
- During drag previews, update connected dependency lines at the same time as bars so the chart never visually lags behind the pointer.
- Keep horizontal drag, vertical sort, resize, and progress gestures distinct. A vertical-dominant drag sorts; a horizontal drag changes dates.
- Preserve simple DOM contracts in tests: `.bar-wrapper[data-id]`, `.dependency-line[data-from][data-to]`, and `.handle.left/.right/.progress`.

## Style

- Favor small modules over one large file. If a helper can be pure, put it in `src/vanilla/` and test it directly.
- Keep markdown row mutation structured through parser/table helpers rather than manual string splicing at call sites.
- Prefer simple, explicit UI state over compatibility shims for removed Frappe behavior.

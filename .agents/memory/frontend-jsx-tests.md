---
name: Frontend JSX test runtime
description: JSX runtime mismatch between the COMET Vite frontend and direct tsx rendering tests.
---

Direct tsx rendering tests can use classic JSX even though Vite renders the same components with the automatic JSX runtime.

**Why:** A component that built successfully for the app failed its direct server-rendering test with `React is not defined`; the failure was in the test compilation/runtime rather than the browser implementation.

**How to apply:** Align the test's JSX transform with Vite, or make the React namespace available in components rendered by classic-JSX tests. Do not interpret that isolated SSR error as evidence that the working Vite page is broken.

---
name: Browser preview resets
description: Distinguish testing-browser resets and stopped development services from application regressions.
---

A browser-testing notebook reset and subsequent preview HTTP 502 are not sufficient evidence of an application crash. Check the managed development service states before debugging application code.

**Why:** Two warehouse browser-verification attempts encountered notebook resets; afterward all managed workflows were reported as not started. Restarting the existing frontend and API restored the preview and allowed the remaining checks to proceed.

**How to apply:** Restore the existing managed services if they are stopped, then continue only unfinished checks with the same tester. Avoid creating duplicate services or treating a reset as a frontend regression. Confirm temporary authentication fixtures were cleaned up even when testing is interrupted.

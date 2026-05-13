# Control Room UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Control Room into a simple task-first command surface that works cleanly on desktop and mobile, while keeping existing production/admin/security functionality reachable.

**Architecture:** Replace the flat feature-wall layout with grouped navigation, a six-card overview, focused group panels, and a contextual detail rail. Extract shared Control Room primitives so cards, empty states, timelines, drawers, and setup guidance stay consistent. Extend the shared GSAP motion utilities with accessible, reduced-motion-safe surface/list/status patterns.

**Tech Stack:** React 18, TypeScript, Tailwind, GSAP, existing `authenticatedFetch`, current Express APIs, smoke scripts under `scripts/smoke`.

---

### Task 1: UX Guardrail Smoke

**Files:**
- Create: `scripts/smoke/control-room-ux-redesign.mjs`

- [ ] Add assertions for a task-first overview, no more than six first-screen action cards, grouped navigation, mobile-first classes, contextual guidance, reusable primitives, timeline items, and reduced-motion-safe motion utilities.
- [ ] Run `node scripts/smoke/control-room-ux-redesign.mjs` and confirm it fails against the old feature-wall page.

### Task 2: Motion Utilities

**Files:**
- Modify: `src/lib/animations.ts`

- [ ] Add centralized `surface`, `drawer`, and `status` motion tokens.
- [ ] Add reusable hooks for surface crossfade, list reveal, and one-shot status highlight.
- [ ] Ensure all hooks respect `prefers-reduced-motion` by switching to opacity-only or no transform.

### Task 3: Control Room Primitives

**Files:**
- Create: `src/components/control-room/ControlRoomPrimitives.tsx`

- [ ] Add `CommandCard`, `SummaryCard`, `ControlRoomPanel`, `ContextDrawer`, `GuidanceCard`, `EmptyGuidance`, `TimelineItem`, `ActionRow`, `ResponsiveDataList`, and `AdvancedDisclosure`.
- [ ] Keep components responsive by default and avoid nested cards.
- [ ] Use 44px minimum action controls for mobile.

### Task 4: Task-First Control Room Page

**Files:**
- Replace: `src/components/control-room/ControlRoomPage.tsx`

- [ ] Keep existing API reads and write actions, but reorganize UI into `operations`, `people`, `access`, `security`, and `insights`.
- [ ] Make the first screen show six action cards: needs attention, running now, approvals/reviews, team/access, security/secrets, usage/evaluations.
- [ ] Use master-detail on desktop and stacked cards plus grouped tabs on mobile.
- [ ] Move forms into advanced disclosures or contextual panels.
- [ ] Add readable agent run timeline and audit feed views.

### Task 5: Verification And Release

**Files:**
- Modify: `package.json`, `package-lock.json`, `desktop/package.json`

- [ ] Run smoke checks, typecheck, lint, build, and npm dry run.
- [ ] Commit with a conventional message.
- [ ] Publish v1.46.7 to npm and GitHub with carried-forward desktop assets.
- [ ] Comment on and close issues #84-#91 with the shipped version and verification notes.

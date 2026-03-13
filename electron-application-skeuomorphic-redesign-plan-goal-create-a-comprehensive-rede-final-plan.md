# Auto-Claude Electron Application — Skeuomorphic Redesign Plan

## Visual Architecture Decisions (Canonical Reference)

> **⚠️ CANONICAL ARCHITECTURE CONTRACT — SINGLE SOURCE OF TRUTH**
>
> This section defines the **one and only** layering architecture for all UI in this application. Every import, every component boundary, and every style dependency MUST comply. There is no alternative architecture. Violations are build errors.
>
> **Implementers**: Start here. Read the layer stack, dependency matrix, and enforcement rules before touching any file.

### Canonical Layer Stack

All UI renders through exactly five layers, ordered from lowest (tokens) to highest (features). **Dependency flows strictly downward** — higher layers consume lower layers, never the reverse. No exceptions. No peer imports across layers at the same level (L1–L4). **L5 features may import other L5 features**, but ONLY through the feature's public API surface (`index.ts` barrel export) — deep imports into another feature's internal modules are forbidden. See "Feature Module Boundaries" below for the complete L5 peer-import contract.

```
Tokens (L1) → Radix (L2) → Material Primitives (L3) → UI Wrappers (L4) → Feature Components (L5)
```

| Layer | Directory | Owns | Consumes |
|-------|-----------|------|----------|
| **L1 — Tokens** | `design-system/tokens/*.css` | Material colors, elevation, motion, spacing, typography, radius | Nothing — pure CSS definitions |
| **L2 — Radix** | `@radix-ui/*`, `class-variance-authority` | Accessibility, ARIA, focus management | L1 tokens via CSS custom properties |
| **L3 — Material Primitives** | `design-system/components/`, `design-system/hooks/`, `design-system/utils/` | Material behavior logic, physics, interaction hooks, material helper utilities | L1 + L2 |
| **L4 — UI Wrappers** | `components/ui/*.tsx` | Drop-in API-compatible material components | L1 + L2 + L3 |
| **L5 — Features** | `components/chat/`, `components/task-detail/`, `components/settings/`, top-level `components/*.tsx` (e.g., `KanbanBoard.tsx`, `TaskCard.tsx`, `Sidebar.tsx`), etc. | Feature-specific layout, state, business logic | L4 + L5 peers (public API only — see Feature Module Boundaries) |

### Token Strategy

- **All visual values flow from L1 tokens.** Zero raw hex/rgb in component files.
- Token prefixes: `--material-paper-*`, `--material-metal-*`, `--material-wood-*`, `--material-glass-*`, `--material-fabric-*`
- Enforcement: Stylelint blocks raw color values at build time; ESLint `import/no-restricted-paths` blocks illegal cross-layer imports.

### Canonical UI Layering Contract

> **⚠️ DEPENDENCY CONTRACT — BUILD-ENFORCED**
>
> This is the single authoritative dependency contract for the entire codebase. Every import must comply. Violations are build errors caught by ESLint `import/no-restricted-paths` and Stylelint token enforcement. No runtime overrides exist.

#### Dependency Matrix — Allowed & Forbidden Imports

| Source Layer (importer) | L1 Tokens | L2 Radix | L3 Material Primitives | L4 UI Wrappers | L5 Features |
|------------------------|-----------|----------|----------------------|----------------|-------------|
| **L1 — Tokens** | — | ❌ | ❌ | ❌ | ❌ |
| **L2 — Radix** | ✅ (CSS vars) | — | ❌ | ❌ | ❌ |
| **L3 — Material Primitives** | ✅ | ✅ | — | ❌ | ❌ |
| **L4 — UI Wrappers** | ✅ | ✅ | ✅ | — | ❌ |
| **L5 — Features** | ❌ | ❌ | ❌ | ✅ | ✅ (public API only) |

**Reading the matrix**: Rows are the importing module; columns are the imported target. ✅ = allowed, ❌ = build error.

**Key rules**:
- L5 features import L4 wrappers for all UI primitives. No skipping layers. No upward imports. No peer imports within L1–L4.
- **L5→L5 peer imports are allowed** but constrained: features may only import from another feature's public API surface (the feature's `index.ts` barrel export). Deep imports into another feature's internal modules (e.g., `components/chat/internal/MessageParser.ts`) are build errors. This enables composition (e.g., a task-detail view embedding a chat widget) without creating brittle cross-feature coupling.
- If two L5 features need shared logic that doesn't belong to either, extract it to L4 (UI utility) or a new shared module at L3/L4, not as a cross-feature import.

#### Concrete Import Examples

```typescript
// ✅ L4 wrapper imports L3 primitive + L2 Radix + L1 tokens
// File: components/ui/material-button.tsx (Layer 4)
import { useMaterialComponent } from '@/design-system/hooks';     // L3 ✅
import * as RadixButton from '@radix-ui/react-button';             // L2 ✅
import '@/design-system/tokens/materials.css';                     // L1 ✅

// ✅ L5 feature imports L4 wrapper only
// File: components/TaskCard.tsx (Layer 5 — top-level component, not in a subdirectory)
import { Button, Card, Badge } from '@/components/ui';             // L4 ✅

// ❌ L5 feature bypasses L4 → imports L3 directly
// File: components/TaskCard.tsx (Layer 5)
import { useMaterialStyles } from '@/design-system/hooks';        // L3 ❌ BUILD ERROR

// ❌ L5 feature imports L2 Radix directly (must use L4 wrapper)
// File: components/chat/Composer.tsx (Layer 5)
import * as Dialog from '@radix-ui/react-dialog';                  // L2 ❌ BUILD ERROR

// ❌ L3 primitive imports L4 wrapper (upward dependency)
// File: design-system/components/MaterialButton.tsx (Layer 3)
import { Button } from '@/components/ui';                          // L4 ❌ BUILD ERROR
```

#### Enforcement Rules

> **⚠️ COMPLETE ENFORCEMENT MATRIX** — Every forbidden edge from the Dependency Matrix above is encoded here. No gap between contract and enforcement.

| Mechanism | Scope | Rule | Forbidden Edge(s) |
|-----------|-------|------|--------------------|
| **ESLint `import/no-restricted-paths`** | L5 → L3 bypass | Feature components (`components/chat/`, `components/task-detail/`, `components/settings/`, top-level `components/*.tsx`) cannot import from `design-system/components/`, `design-system/hooks/`, or `design-system/utils/` | L5→L3 |
| **ESLint `import/no-restricted-paths`** | L5 → L2 bypass | Feature components cannot import `@radix-ui/*` or `class-variance-authority` directly | L5→L2 |
| **ESLint `import/no-restricted-paths`** | L5 → L1 bypass | Feature components cannot import `design-system/tokens/` directly (tokens arrive via L4 wrapper CSS) | L5→L1 |
| **ESLint `import/no-restricted-paths`** | L5 → L5 deep import | Feature components may import peer features ONLY via barrel `index.ts`; pattern: `from '@/components/{feature}/'` must resolve to `index.ts` — deep path imports (`components/chat/internal/*`) are build errors | L5→L5 (deep) |
| **ESLint `import/no-restricted-paths`** | L4 → L5 upward | `components/ui/*.tsx` cannot import from `components/chat/`, `components/task-detail/`, `components/settings/`, or top-level feature `components/*.tsx` | L4→L5 |
| **ESLint `import/no-restricted-paths`** | L3 → L4 upward | Material primitives (`design-system/components/`, `design-system/hooks/`, `design-system/utils/`) cannot import `components/ui/` | L3→L4 |
| **ESLint `import/no-restricted-paths`** | L3 → L5 upward | Material primitives cannot import any feature component | L3→L5 |
| **ESLint `import/no-restricted-paths`** | L2 → L3/L4/L5 upward | `@radix-ui/*` is an external dep (no enforcement needed); but `class-variance-authority` config files cannot import `design-system/` or `components/` | L2→L3/L4/L5 |
| **ESLint `import/no-restricted-paths`** | L1 → L2/L3/L4/L5 | Token CSS files (`design-system/tokens/*.css`) are pure definitions — no JS imports allowed in token files at all | L1→any |
| **Stylelint `color-no-hex`** | L2–L5 files | No raw hex/rgb values; must use L1 token custom properties | All layers |
| **Stylelint token enforcement** | L2–L5 files | `background-color`, `color`, `border-color`, `box-shadow` must reference `var(--material-*)` or `var(--elevation-*)` | All layers |
| **Path-alias lint** | All layers | `@/components/ui` is the only valid import alias for L5 consumers; `@/design-system/*` is the only valid alias for L3/L4 consumers | Cross-layer |
| **CSS scope enforcement** | L4 wrappers | L4 component CSS must not use selectors that reach into L5 DOM (no `.kanban-board .material-button` in `ui/material-button.css`) | L4→L5 styling |

**Example ESLint configuration for complete enforcement:**

```jsonc
// .eslintrc.js — import/no-restricted-paths (complete enforcement of all forbidden edges)
{
  "rules": {
    "import/no-restricted-paths": ["error", {
      "zones": [
        // L5 cannot import L1 (tokens)
        { "target": "./src/renderer/components/!(ui)/**", "from": "./src/renderer/design-system/tokens/**", "message": "L5→L1 forbidden: features must not import tokens directly; tokens arrive via L4 wrapper CSS" },
        // L5 cannot import L2 (Radix)
        { "target": "./src/renderer/components/!(ui)/**", "from": "@radix-ui/**", "message": "L5→L2 forbidden: features must use L4 wrappers, not Radix directly" },
        // L5 cannot import L3 (material primitives)
        { "target": "./src/renderer/components/!(ui)/**", "from": "./src/renderer/design-system/components/**", "message": "L5→L3 forbidden: features must import L4 wrappers, not material primitives" },
        { "target": "./src/renderer/components/!(ui)/**", "from": "./src/renderer/design-system/hooks/**", "message": "L5→L3 forbidden: features must import L4 wrappers, not material hooks" },
        { "target": "./src/renderer/components/!(ui)/**", "from": "./src/renderer/design-system/utils/**", "message": "L5→L3 forbidden: features must import L4 wrappers, not material utils" },
        // L4 cannot import L5 (upward)
        { "target": "./src/renderer/components/ui/**", "from": "./src/renderer/components/!(ui)/**", "message": "L4→L5 forbidden: UI wrappers cannot import feature components" },
        // L3 cannot import L4 (upward)
        { "target": "./src/renderer/design-system/**", "from": "./src/renderer/components/ui/**", "message": "L3→L4 forbidden: material primitives cannot import UI wrappers" },
        // L3 cannot import L5 (upward)
        { "target": "./src/renderer/design-system/**", "from": "./src/renderer/components/!(ui)/**", "message": "L3→L5 forbidden: material primitives cannot import feature components" }
        // L5→L5 deep import enforcement requires custom rule or resolver plugin
        // to block paths deeper than components/{feature}/index.ts
        // L1→any: enforced by nature (CSS files have no JS imports)
        // L2→L3/L4/L5: @radix-ui is external (no enforcement needed); CVA config files are static
      ]
    }]
  }
}
```

### Ownership Boundaries & Change Process

| Layer | Owning Team | Change Protocol | Stability Guarantee |
|-------|-------------|-----------------|---------------------|
| **L1 — Tokens** | Design System team | Changes require cross-team review; version-bumped; changelog entry | Stable — breaking changes require migration guide |
| **L2 — Radix** | Upstream dependency (pinned) | Do not fork; pin versions in `package.json`; upgrade via PR | External — version-locked |
| **L3 — Material Primitives** | Design System team | API changes require RFC + 2-week deprecation notice | Semi-stable — internal API may evolve |
| **L4 — UI Wrappers** | Design System team maintains; Feature teams consume | API contract changes require migration guide; barrel exports are public API | Stable public API — internal implementation may change |
| **L5 — Features** | Feature teams own | Must import L4 only; CI audit enforced | Consumer — no design-system ownership |

### Migration Mapping Summary (Current → Target)

| Current Module | Target Layer | Action | Phase |
|----------------|-------------|--------|-------|
| `design-system/tokens/*.css` | **L1** (canonical) | Promote — begin consuming from L4 wrappers | Phase 1 |
| `@radix-ui/*`, `class-variance-authority` | **L2** (unchanged) | Pin version; remove direct L5 imports | — |
| `design-system/components/`, `design-system/hooks/`, `design-system/utils/` | **L3** (canonical) | Promote — consumed by new L4 wrappers | Phase 2 |
| `components/ui/*.tsx` (flat Radix wrappers) | **L4** (migrating) | Barrel swap: export material wrapper as original name | Phase 2–3 |
| `components/chat/`, `components/task-detail/`, `components/settings/`, top-level `components/*.tsx` (e.g., `KanbanBoard.tsx`, `TaskCard.tsx`), etc. | **L5** (no change) | Audit: remove any direct L2/L3 imports; material arrives via L4 swap | Phase 2 |
| `.design-system/` (standalone Vite app) | **Delete** | Freeze Phase 1 → delete Phase 4 | Phase 1–4 |
| `styles/globals.css` shadow/color tokens | **L1 migration** | Replace with L1 `design-system/tokens/` refs | Phase 1 |

> **Full migration map**: See §1A for the complete per-file migration table with 30+ entries.

### Component Ownership

- `import { Button } from '@/components/ui'` — **this never changes**. The barrel export swaps flat → material internally.
- Feature code (L5) is forbidden from importing `design-system/` directly.
- Each L4 wrapper must: extend original props (`MaterialXProps extends OriginalXProps`), forward refs, merge classNames, preserve all event handlers.

### Feature Module Boundaries (L5 Peer-Import Contract)

> **⚠️ L5 MODULARITY CONTRACT** — Prevents cross-feature coupling as the codebase scales.

**Problem**: Top-level `components/*.tsx` files (e.g., `KanbanBoard.tsx`, `TaskCard.tsx`, `Sidebar.tsx`) and subdirectory features (e.g., `components/chat/`, `components/task-detail/`) are all L5. Without defined boundaries, L5-to-L5 imports create implicit coupling and make features non-extractable.

**Rules**:

1. **Every L5 feature directory MUST export a public API via `index.ts`** (barrel export). Only symbols exported from `index.ts` may be imported by other L5 features.
   ```typescript
   // components/chat/index.ts — public API surface
   export { ChatAgent } from './ChatAgent';
   export { Composer } from './Composer';
   export type { ChatMessage, ChatConfig } from './types';
   // Internal modules (e.g., ./internal/MessageParser.ts) are NOT exported
   ```

2. **Top-level L5 files** (e.g., `KanbanBoard.tsx`, `TaskCard.tsx`) are their own module boundary — they export only their default/named exports. No deep imports into co-located helper files unless the helper is an explicit re-export.

3. **Deep imports across feature boundaries are build errors**:
   ```typescript
   // ❌ BUILD ERROR — deep import into chat internals
   import { parseMessage } from '@/components/chat/internal/MessageParser';
   
   // ✅ ALLOWED — import from chat's public API
   import { ChatAgent } from '@/components/chat';
   ```

4. **Shared logic extraction rule**: If two or more L5 features need the same utility/hook/type that isn't UI-related, extract it to:
   - `lib/` or `utils/` (application-level shared logic — NOT L3/L4/L5)
   - `design-system/hooks/` or `design-system/utils/` (L3) if it's material/design-related
   - `components/ui/` (L4) if it's a shared UI primitive
   
   **Never** duplicate shared logic across L5 features or create an ad-hoc cross-feature import.

5. **ESLint enforcement**: The `import/no-restricted-paths` zone for L5→L5 deep imports (see Enforcement Rules above) blocks any import that resolves deeper than `components/{feature}/index.ts`.

### Screen Mapping (Material Distribution)

| Screen | Paper | Metal | Wood | Glass | Fabric | Primary Reference |
|--------|-------|-------|------|-------|--------|-------------------|
| Dashboard / Main | 55% | 28% | 12% | 0% | 5% | §1B |
| Kanban Board | 58% | 18% | 8% | 0% | 16% | §1B |
| Modal / Dialog | 50% | 15% | 10% | 25% | 0% | §1B |
| Settings | 60% | 28% | 8% | 0% | 4% | §1B |
| Chat / Agent | 72% | 16% | 8% | 0% | 4% | §1B |
| Terminal | 45% | 42% | 3% | 0% | 10% | §1B |
| File Explorer | 62% | 25% | 8% | 0% | 5% | §1B |
| Search / Palette | 35% | 15% | 5% | 40% | 5% | §1B |
| Insights | 65% | 22% | 8% | 0% | 5% | §1B |

**Material Distribution Governance**:

> The per-screen targets in the table above are the **authoritative source of truth** for material distribution. The global baseline (60/25/10/4/1) is a design intent guideline, NOT a hard enforcement rule applied uniformly to every screen. Screens with specialized content (e.g., Chat at 72% paper, Search at 40% glass, Terminal at 42% metal) deviate from the global baseline by design — their per-screen targets reflect intentional material choices driven by screen function.

**Validation rules**:
1. **Per-screen targets are canonical**: The build-time validator checks each screen against its row in the table above, NOT against the global 60/25/10/4/1 baseline. For the complete measurement methodology (what is measured, viewport set, area computation, transient UI handling, pass/fail thresholds), see **§8.1.3 Material Distribution Validation Specification**.
2. **Per-screen tolerance**: ±5% on each material percentage per screen. E.g., Chat paper can be 67–77%.
3. **Global baseline role**: The 60/25/10/4/1 ratio is the default for NEW screens not yet listed in the matrix. Once a screen is added to the matrix with its own targets, those targets supersede the global baseline.
4. **Exception rationale** (for screens deviating >10% from global baseline):
   | Screen | Deviation | Rationale |
   |--------|-----------|-----------|
   | Chat / Agent | Paper 72% (+12%) | Chat is a reading-heavy surface; paper dominance supports readability |
   | Terminal | Metal 42% (+17%) | Terminal is a tool surface; metal communicates precision/technical control |
   | Search / Palette | Glass 40% (+36%) | Search overlay is ephemeral; glass communicates transience and transparency |
   | Modal / Dialog | Glass 25% (+21%) | Modals are overlays; glass separates modal content from underlying surface |

### Quick-Start for Implementers

1. **Architecture** → Visual Architecture Decisions (top of document: layer stack, dependency matrix, ownership boundaries, enforcement rules)
2. **Migration mapping** → §1A (which file goes to which layer, barrel swap mechanism, deprecation path)
3. **Per-component migration** → §1.4 (wrapper strategy, API contracts, wave schedule)
4. **Tokens** → §2.1 (CSS custom properties, tier hierarchy, enforcement rules)
5. **User flows** → §1C — 6 end-to-end interaction specifications:
   - Flow 1: Create Task (Cmd+N → wizard → kanban)
   - Flow 2: Switch Project (tab click/Cmd+1-9 → content load)
   - Flow 3: Edit Task (card click → dialog → save/undo)
   - Flow 4: Delete/Archive Task (⋯ menu → confirm → undo toast)
   - Flow 5: Error Recovery (error → cause + CTA → retry/go back)
   - Flow 6: Configure Settings (Cmd+, → preferences → theme switch)
6. **For any screen** → §1B (Screen Matrix) → §1C (User Flows) → §1D (State Matrix) → §1E (Density Rules)

### Plan Validation Summary

> This summary provides a structured self-assessment of plan completeness, enabling rapid evaluation without parsing the full document.

| Validation Dimension | Status | Evidence Location | Key Metric |
|---------------------|--------|-------------------|------------|
| **Architecture definition** | ✅ Complete | Visual Architecture Decisions (top) | 5-layer stack with dependency matrix, enforcement rules, ownership |
| **Dependency direction** | ✅ Explicit | Dependency Matrix table | L1→L2→L3→L4→L5 strict downward; no upward imports; no peer imports within L1–L4; L5 peer imports allowed via public API only; ESLint enforced |
| **Component inventory** | ⚠️ Mostly complete | §1.1 (27 primitives + ~389 domain files), §1.4 (migration map) | 33 components catalogued with material specs; barrel file exports only 15/27; ComponentType covers 9/27 |
| **User flows (end-to-end)** | ✅ 6 flows | §1C | Create, Switch Project, Edit, Delete/Archive, Error Recovery, Settings |
| **Flow interaction depth** | ✅ Step-level | §1C each flow | Intent → Action → State Transitions → Feedback → Error → Recovery → Undo |
| **Screen specifications** | ✅ 9 screens | §1B | Per-zone material assignments, responsive rules, breakpoints |
| **Component state matrix** | ✅ 11 views | §1D | Idle / Loading / Empty / Error / Success per view |
| **Design token system** | ✅ 3-tier | §2.1 | Tokens → Patterns → Components; 6 token files verified present |
| **Migration strategy** | ✅ Per-file | §1A, §9.2, §10.6 | Module-to-layer map (30+ entries); barrel-swap mechanism |
| **Implementation timeline** | ✅ 8-week | §5, §9.1 | 4 phases; per-week deliverables; critical path dependencies |
| **TypeScript interfaces** | ✅ Complete | §11 | Core types, theme types, base/component interfaces, hooks |
| **Theme coverage** | ⚠️ 9 themes (2 missing material specs) | §2.3, §12 | 9 themes × 2 modes verified in `globals.css`; 7 themes have material specs; `emerald` and `material-darker` need material adaptations, FOUC prevention, and contrast validation |
| **Risk mitigation** | ✅ Defined | §7 | Technical + UX risks with mitigations and rollback procedures |
| **Performance budgets** | ✅ Enforced | §16 | 60fps target; build-time + runtime validation; adaptive material tiers |
| **Accessibility framework** | ✅ Comprehensive | §2.5, §15, see index below | WCAG AAA primary target (7:1 normal text, 4.5:1 large text); AA floor for glass only with documented rationale; automated + manual; high contrast; reduced motion; inline validation |
| **ADRs** | ✅ 5 recorded | §17 | Radix wrapping, token SoT, feature-flag migration, .design-system deprecation, material identity |

### Accessibility Compliance Index

> Structured index of all accessibility provisions in this plan, mapped to WCAG 2.1 criteria.

| WCAG Criterion | Requirement | Plan Coverage | Section |
|---------------|-------------|---------------|---------|
| **1.1.1** Non-text Content | Textures must not convey information | All textures are decorative CSS `background-image`; `role="presentation"` where needed | §15.1 |
| **1.3.1** Info and Relationships | Depth cues must not be sole hierarchy indicator | Semantic HTML + ARIA roles convey hierarchy independent of visual depth | §15.1 |
| **1.4.1** Use of Color | Error/status not conveyed by color alone | All error states use icon + text + color; §1D defines per-state visual contracts | §1D, §15.1 |
| **1.4.3** Contrast (Minimum) | 4.5:1 text contrast on all material surfaces (AA floor; AAA 7:1 is the primary target — see 1.4.6 below) | Per-material contrast validation in automated test suite; all 9 themes × 2 modes tested; automated tests run at AAA thresholds first, fall back to AA floor only for glass/overlay surfaces with documented rationale | §15.2, §15.3 |
| **1.4.6** Contrast (Enhanced — AAA) | 7:1 normal text, 4.5:1 large text (≥18pt/14pt bold) on all material surfaces | AAA is the primary target; AA (4.5:1) is the floor for glass/overlay surfaces where AAA is technically infeasible. All contrast validations run at AAA thresholds first. | §15.2, §15.3 |
| **1.4.11** Non-text Contrast | 3:1 for UI components and graphical objects | Focus rings, borders, and interactive affordances tested per material | §15.2 |
| **2.1.1** Keyboard | All functionality via keyboard | Radix primitives provide keyboard support; shortcuts defined per flow in §1C | §1C, §13 |
| **2.3.1** Three Flashes | No content flashes > 3/sec | All animations < 3 flashes/sec; `prefers-reduced-motion` disables physics | §15.1, §2.5.2 |
| **2.4.7** Focus Visible | Focus indicator always visible with ≥3:1 contrast against adjacent material colors (AAA enhanced visibility) | Material-specific focus rings: wood=orange, metal=blue, paper=dark outline; minimum 3px width; tested against all material backgrounds in all 9 themes × 2 modes | §15.1, §2.1.5 |
| **2.4.11** Focus Not Obscured | Focus indicator not hidden by content; ≥3:1 contrast against adjacent material | Focus ring 3:1 contrast against adjacent material colors; z-index ensures focus ring is never clipped by adjacent elevated elements | §15.2 |
| **3.3.1** Error Identification | Errors identified and described in text; inline field-level validation before submission | Every error shows: what happened, why, what to do (§1C Flow 5 contract). All form inputs validate inline at field level (see "Inline Validation Requirements" in Acceptance Criteria). Error messages include actionable recovery guidance. | §1C, §1D, Acceptance Criteria |
| **4.1.2** Name, Role, Value | Components have accessible names/roles | ARIA labels describe function not material ("Submit" not "Wooden button") | §15.1 |
| **Forced Colors** | Windows High Contrast support | `@media (forced-colors: active)` removes textures/shadows; uses system colors | §15.4 |
| **Reduced Motion** | `prefers-reduced-motion` support | All material physics disabled; state changes use instant transitions | §2.5.2, §15.2 |
| **Screen Reader** | Material metaphors transparent to AT | Textures CSS-only (decorative); state changes announced via `aria-live` | §15.2 |

**Validation requirement**: Every L4 wrapper must pass the §15.3 manual checklist (9 items) AND the §15.2 automated axe audit before shipping.

---

## 1.0 Scope, Objectives & Execution Summary

### What This Plan Covers

Transform every UI surface of the Auto-Claude Electron application from modern flat design to a cohesive skeuomorphic interface using five canonical material types — **wood, metal, paper, glass, fabric** — across all 9 themes, all 27 UI primitives, and all major application screens.

> **⚠️ AUDIT CORRECTION (Theme Count)**: The codebase contains **9 themes**, not 7. The complete set verified in `globals.css` is: `default`, `dusk`, `lime`, `ocean`, `retro`, `neo`, `forest`, **`emerald`**, and **`material-darker`**. The `emerald` and `material-darker` themes were added after the initial plan draft and must be included in all theme-related specifications, material adaptations, and contrast validation matrices throughout this document.

### Target User Journeys (Primary Redesign Surfaces)

> **Cross-reference**: Each journey maps to a Canonical User Flow in §1C with full intent → action → system feedback → recovery specifications.

| # | Journey | Entry Point → Completion | Primary Screens | Canonical Flow |
|---|---------|--------------------------|-----------------|---------------|
| 1 | **Task Creation & Management** | Click "New Task" → fill wizard → assign → track on kanban → complete | Kanban Board, Task Creation Wizard, Task Card | §1C Flow 1 |
| 2 | **Project Navigation** | Switch project tabs → browse sidebar views → drill into features | Project Tab Bar, Sidebar, Content Area | §1C Flow 2 |
| 3 | **Content Editing** | Open task → edit description → interact with chat agent → review output | Task Edit Dialog, Chat View, Composer | §1C Flow 3 |
| 4 | **Task Deletion & Archival** | Open task menu → delete or archive → confirm → undo if needed | Kanban Board, Confirmation Dialog, Toast | §1C Flow 4 |
| 5 | **Error Recovery** | Encounter error → understand cause → take corrective action → resume | Error Boundaries, Toast, Error Cards | §1C Flow 5 |
| 6 | **System Configuration** | Open settings → adjust preferences → switch themes → confirm | Settings View, Theme Selector | §1C Flow 6 |

### Component Migration Order (Implementation Sequence)

1. **Foundation** (Week 1-2): Design tokens, material base classes, theme integration
2. **High-Impact Primitives** (Week 3-4): Button → Card → Input → Dialog → Badge → Select → Tabs
3. **Layout & Navigation** (Week 5-6): Sidebar → TabBar → KanbanBoard → Modal system
4. **Polish & Remaining** (Week 7-8): Toast, Progress, Tooltip, Popover, Scroll Area, accessibility audit

### Acceptance Criteria (Implementation-Wide)

- [ ] Every `ui/` component consumed via a Material wrapper that preserves existing API
- [ ] Zero raw hex/rgb values in component files (semantic tokens only)
- [ ] Material distribution validated per screen against its **per-screen target** in the Screen Mapping table (±5% tolerance; ±10% = hard build error). The 60/25/10/4/1 baseline applies ONLY to new screens not yet listed. See "Material Distribution Governance" and §8.1.3 for measurement methodology.
- [ ] WCAG AAA contrast (7:1 for normal text, 4.5:1 for large text ≥18pt/14pt bold) met for all text on all material surfaces in all 9 themes × 2 modes. Where AAA is technically infeasible on specific glass/overlay surfaces, document the exception with AA (4.5:1) as the floor and a rationale.
- [ ] 60fps animation on i5-8400 / 8GB RAM baseline hardware
- [ ] `prefers-reduced-motion` and `forced-colors` (Windows High Contrast) fully supported
- [ ] Every error state shows: what happened, why, what user can do next
- [ ] Inline field-level validation for all form inputs (task creation/edit/settings) — errors appear at the field before submission with actionable guidance (see "Inline Validation Requirements" below)
- [ ] Standardized loading indicators (skeleton screens for content areas, spinners for discrete actions) and explicit empty-state guidance copy for every screen/view (see "Loading & Empty State Standards" below)

#### Inline Validation Requirements

> **⚠️ FORM UX CONTRACT** — Applies to all form-heavy flows: Task Creation (§1C Flow 1), Task Editing (§1C Flow 3), Settings (§1C Flow 6), and any future form surfaces.

1. **Field-level inline validation**: Every input field that has constraints (required, format, length, uniqueness) MUST display validation feedback inline — directly below the field — as soon as the constraint can be evaluated. Do NOT defer all validation to form submission.
2. **Validation timing**:
   - **Required fields**: Show "Required" error on blur if empty (not on initial render).
   - **Format constraints** (email, URL, date): Validate on blur; show specific guidance ("Enter a valid URL, e.g., https://example.com").
   - **Length constraints**: Show character count during input; error on blur if exceeded.
   - **Async validation** (e.g., uniqueness checks): Show inline spinner during check; result on completion.
3. **Error message contract**: Every inline error MUST include:
   - What is wrong (e.g., "Title is required")
   - How to fix it (e.g., "Enter a task title between 1-200 characters")
4. **Visual treatment**: Inline errors use the `--material-error-*` token family. Error border (wood-accent red), error text (7:1 contrast on paper surface), error icon (⚠ or ✕). Never color-only — always icon + text.
5. **Recovery flow**: When the user corrects the field, the error clears immediately (on input change, not on next blur). Success state shown briefly (✓ checkmark, 1s fade).
6. **Submission guard**: The submit/save action is disabled (visually and functionally) while any inline error is active. On attempted submission with errors, scroll to the first error field and focus it.
7. **Material integration**: Error states on input fields use the L4 MaterialInput's `error` variant — wood-accented red border with paper surface error card below the field.

#### Loading & Empty State Standards

> **⚠️ ASYNC UX CONTRACT** — Applies to all screens and views defined in §1B and §1D.

1. **Loading indicators by context**:
   | Context | Indicator Type | Material Treatment |
   |---------|---------------|-------------------|
   | Content area initial load (kanban, chat history, file list) | Skeleton screen matching material surface (paper skeleton, metal frame skeleton) | Paper material with `opacity: 0.6` pulse animation; metal accents as static frames |
   | Discrete action (save, delete, send message) | Inline spinner next to the action trigger | Metal spinner token (`--material-metal-spinner`) at 16×16px |
   | Page/route transition | Full-area skeleton with sidebar preserved | Fabric background + paper skeleton content |
   | Data refresh (pull-to-refresh, polling) | Subtle top-bar progress indicator | Metal progress bar at viewport top, 2px height |

2. **Empty state requirements** — every view in §1D MUST define an empty state with:
   - **Illustration or icon**: Material-themed (paper notepad, empty metal tray, etc.) — decorative, not informational
   - **Headline**: What this area is for ("No tasks yet", "No messages", "No search results")
   - **Guidance copy**: What the user should do next ("Create your first task with Cmd+N", "Start a conversation with the agent")
   - **Primary action CTA**: A material-styled button (wood primary) that initiates the most logical next action
   - **Empty state mapping** (per screen):
     | Screen/View | Empty State Headline | CTA |
     |-------------|---------------------|-----|
     | Kanban Board | "No tasks in this project" | "Create Task" (Cmd+N) |
     | Chat / Agent | "No conversation yet" | "Send a message" (focus composer) |
     | File Explorer | "No files found" | "Upload a file" or "Create a file" |
     | Search / Palette | "No results for '{query}'" | "Try a different search" (clear + refocus) |
     | Terminal | "No terminal sessions" | "Open Terminal" |
     | Insights | "No insights available" | "Run analysis" |
     | Settings | (no empty state — always has content) | — |

3. **Loading → Empty transition**: If loading completes with zero results, transition smoothly (200ms fade) from skeleton to empty state. Never flash the skeleton and then instantly swap to empty — the user needs to perceive the system tried.

### Constraints & Assumptions

- Radix UI primitives remain the accessibility foundation; material styling wraps them, not replaces them
- Tailwind CSS v4 stays as utility layer; material tokens integrate via CSS custom properties
- All 9 existing themes (`default`, `dusk`, `lime`, `ocean`, `retro`, `neo`, `forest`, `emerald`, `material-darker`) must be preserved
- The in-app `design-system/` directory is the canonical material system; the standalone `.design-system/` is deprecated

### Document Structure

| Section | Content |
|---------|---------|
| §1 | Current UI Audit — verified codebase state, 27 primitives, ~389 domain component files, 12 inconsistencies (expanded from 10), L5 layering violations, barrel file gaps |
| §1A | Module-to-Layer Migration Mapping — every file mapped to its target canonical layer (30+ entries) |
| §1B | Screen Specification Matrix — 9 screens with per-zone material assignments, layout regions, responsive rules |
| §1C | Canonical User Flows (6 flows) — end-to-end interaction specs: intent → action → feedback → error → recovery → undo |
| §1D | Component State Matrix — idle/loading/empty/error/success visual contracts for 11 views |
| §1E | Interaction Density & Progressive Disclosure Rules — action density limits per screen zone |
| §2 | Design System Blueprint — 3-tier token hierarchy, textures, lighting, patterns, enforcement rules |
| §3 | Component-by-Component Redesign Specifications — navigation, task, controls, overlay, feedback components |
| §3a | Usage Rules Quick Reference — material selection decision matrix, interaction pattern rules, enforcement checklists |
| §4 | Technical Implementation Strategy — CSS custom properties, component architecture, performance, accessibility |
| §5 | Implementation Phases — 4-phase / 8-week rollout with per-phase deliverables |
| §6 | Quality Assurance & Success Metrics — visual consistency, interaction quality, performance benchmarks |
| §7 | Risk Mitigation — technical risks (performance, cross-browser) + UX risks (cognitive load, familiarity) |
| §8 | Design System Usage Rules & Application Guidelines — material selection, interaction, layout, theme rules |
| §9 | Critical Gaps Resolution — 8-week sprint timeline with per-week deliverables and critical path |
| §10a | Implementation Readiness & Explicit Reuse Guidance — execution sequence, theme patterns, perf optimization |
| §11 | TypeScript Component Interfaces — core types, theme system, base/component-specific interfaces, hooks |
| §12 | Theme Switching Architecture — ThemeProvider, FOUC prevention, theme switching UI |
| §13 | Radix UI Integration Strategy — wrapper pattern, integration map, migration compatibility |
| §14 | User Onboarding & Design Transition — phased rollout, guided introduction, cognitive load management |
| §15 | Accessibility Validation Framework — automated axe suite, manual checklist, high contrast, reduced motion |
| §16 | Adaptive Material System & Performance Budgets — hardware tiers, runtime adaptation, CSS perf analysis |
| §17 | Architecture Decision Records (5 ADRs) — Radix wrapping, token SoT, feature flags, deprecation, material identity |
| §18 | Implementation Readiness Summary — final checklist of all implementation artifacts |

## Executive Summary

### Critical Audit Findings

| Finding | Severity | Resolution | Section |
|---------|----------|------------|---------|
| 3 disconnected design systems with no shared tokens or components | CRITICAL | Canonical 5-layer architecture defined (see Visual Architecture Decisions above); `.design-system/` deprecated; `design-system/` is Layer 1+3; `components/ui/` is Layer 4 | §1A |
| 7 L5 feature files directly import `@radix-ui/react-dialog`, bypassing L4 | HIGH | Refactor each file to import from `@/components/ui/dialog`; must complete before Phase 2 barrel swap | §1.3 #1a |
| Barrel file (`ui/index.ts`) only exports 15 of 27 components; 12 missing | HIGH | Add all 27 primitives to barrel; prerequisite for barrel-swap migration strategy | §1.3 #1b |
| 4 of 21 UI primitives have material equivalents; 17 require new wrappers | HIGH | Per-component adapter/facade strategy with backward-compat API contracts and wave-based rollout | §1.4 |
| 6 of 9 themes have material-authenticity violations (wood colored blue/green/red); 2 themes have NO material specs at all | HIGH | Theme-specific material overrides constrained to tint-only; hue ranges locked per material species; add `emerald` and `material-darker` to `design-system/index.css` | §1.3, §12.2 |
| Material tokens, hooks, utilities completely unused by running application | HIGH | Feature-flag migration via `withMaterialMigration()` HOC; barrel-swap at `ui/index.ts` | §9.2 |
| CSS syntax error: `#HONEYDEW` invalid hex in forest theme | MEDIUM | Replace with `#F0FFF0` in `design-system/index.css` | §1.3 |
| Neo theme inverts paper to near-black, breaking reading-surface metaphor | HIGH | Neo paper set to `#2A2A30` (dark surface) with `#E8E8EC` text — maintains reading metaphor via relative lightness | §1.3, §12.2 |
| `ComponentType` in `types.ts` has 9 entries (not 10 as previously claimed); `MaterialVariant` uses `platinum`/`titanium`/`oak` — these match the CSS token names in `materials.css` (e.g., `--material-metal-platinum`, `--material-metal-titanium`, `--material-wood-oak`) so **no naming mismatch exists** between TypeScript and CSS. However, the plan's §2.1.1 Tier 1 token examples incorrectly introduced phantom names (`aluminum`, `dark-steel`, `cherry`) that are absent from both `types.ts` and `materials.css`. | MEDIUM | Remove phantom token names from §2.1.1; ensure all plan references use the canonical names: `platinum`/`steel`/`titanium` (metal) and `walnut`/`mahogany`/`oak` (wood) | §1.2, §2.1.1 |

### Implementation Readiness

⚠️ **REQUIRES MIGRATION WORK** — 17 of 21 UI primitives need material wrappers; 6 of 9 themes have material-authenticity violations and 2 themes (`emerald`, `material-darker`) have no material token overrides at all. The barrel file (`ui/index.ts`) is missing 12 component exports, blocking the barrel-swap migration strategy. 7 L5 feature files bypass L4 by importing `@radix-ui/react-dialog` directly. The 4 existing material components (MaterialButton, MaterialCard, MaterialInput, MaterialModal) and the full token system are ready as Wave 1 starting points. See §1A for the complete module-to-layer migration map.

## 1. Current UI Pattern Audit

> All component references, file paths, and implementation details verified against `apps/frontend/src/renderer/` and `.design-system/`.

### 1.1 Existing Design System Analysis

The Auto-Claude application currently employs a **modern flat design system** built on **Tailwind CSS v4**, **Radix UI primitives**, and **class-variance-authority (CVA)** for variant management. There are **two co-existing design systems**:

1. **Primary (Active)**: `apps/frontend/src/renderer/components/ui/` — Radix-based components with Tailwind classes used throughout the application.
2. **Skeuomorphic (Partially Built)**: `apps/frontend/src/renderer/design-system/` — Material-based components with CSS token system, hooks, and utilities. **Not yet integrated into the main application.**
3. **Standalone Demo**: `.design-system/` — A separate Vite-based design system app with its own theme constants and component implementations.

**⚠️ KEY FINDING**: The three design systems are not synchronized. The standalone `.design-system/` uses different font stacks (`Inter`), color tokens, and component APIs than the primary app (`-apple-system, BlinkMacSystemFont, 'SF Pro Display'`). The in-app `design-system/` directory has material tokens defined but no components in the main app consume them.

#### Design Token Structure (Verified)
- **Color System**: Multi-theme support (9 themes: `default`, `dusk`, `lime`, `ocean`, `retro`, `neo`, `forest`, `emerald`, `material-darker`) defined in `.design-system/src/theme/constants.ts`, `apps/frontend/src/renderer/styles/globals.css`, and partially in `apps/frontend/src/renderer/design-system/index.css`
  > **⚠️ AUDIT FINDING**: The `emerald` and `material-darker` themes exist in `globals.css` (both light and dark modes) but are absent from `design-system/index.css` — they have NO material token overrides. Any material component will fall back to `:root` defaults for these themes.
- **Typography**: System font stack (`-apple-system, SF Pro Display, Segoe UI`) in the main app; `Inter` in the standalone design system — **inconsistency**
- **Spacing**: Standard Tailwind utilities; material-aware spacing tokens exist in `design-system/tokens/spacing.css` but are **unused** by any component
- **Shadows**: Minimal 4-level system (`--shadow-sm/md/lg/xl`) in `globals.css`; a full 13-level elevation system exists in `design-system/tokens/elevation.css` but is **unused**
- **Border Radius**: Standard modern values (`--radius-sm: 4px` to `--radius-full: 9999px`) — both systems define these independently

#### Current Component Categories (Verified Inventory)

**1. Navigation Components (~20% of UI surface area)**
- `Sidebar.tsx` (587+ lines): Left navigation with icon-based menu items using Lucide icons, `ScrollArea`, `Separator`, `Tooltip`, and `Button` from `ui/`. Supports 15 view types.
- `ProjectTabBar.tsx`: Horizontal sortable tab system using `@dnd-kit` for project switching with keyboard shortcuts (Cmd+1-9, Cmd+Tab)
- `SortableProjectTab.tsx`: Individual draggable project tabs

**2. Data Display Components (~30% of UI surface area)**
- `TaskCard.tsx` (300+ lines): Memo-optimized cards using `Card`, `Badge`, `Button`, `Checkbox`, `DropdownMenu` from `ui/`. Uses `class-variance-authority` for status/priority badge coloring. Custom comparator for React.memo optimization.
- `KanbanBoard.tsx` (500+ lines): DnD-Kit powered column layout with `DroppableColumn` sub-components, sortable task cards, queue management, and bulk operations
- `PhaseProgressIndicator.tsx`: Phase-based progress display
- `Roadmap.tsx`, `RoadmapKanbanView.tsx`: Feature roadmap visualization
- `Insights.tsx`: Analytics/insights display

**3. Interactive Components (~35% of UI surface area)**
- **UI Primitives** (27 components in `ui/` directory):
  - `button.tsx`: CVA-based with 9 variants (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, `success`, `warning`, `info`) and 4 sizes. Uses `active:scale-[0.98]` for press feedback.
  - `input.tsx`: Simple bordered input with `bg-card`, focus ring, no material treatment
  - `dialog.tsx`: Radix Dialog with `bg-black/80 backdrop-blur-sm` overlay, `bg-card` content with `shadow-xl`
  - `select.tsx`: Radix Select with standard border/bg styling
  - `switch.tsx`: Radix Switch with simple toggle, no material metaphor
  - `tabs.tsx`: Radix Tabs with `bg-secondary` list and `bg-card` active state
  - `checkbox.tsx`, `radio-group.tsx`, `textarea.tsx`, `label.tsx`
  - `dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx`, `combobox.tsx`
  - `alert-dialog.tsx`, `full-screen-dialog.tsx`, `scroll-area.tsx`
  - `separator.tsx`, `collapsible.tsx`, `progress.tsx`
  - `resizable-panels.tsx`, `error-boundary.tsx`, `PermissionModePicker.tsx`
- **Domain Components** (~389 files across 16 subdirectories + top-level): TaskCreationWizard, TaskEditDialog, ChatAgent, Composer, Terminal, FileExplorer, KanbanBoard, Sidebar, ProjectTabBar, Insights, Roadmap, Settings, and many more. Notable: `KanbanBoard.tsx`, `TaskCard.tsx`, `SortableTaskCard.tsx`, `Sidebar.tsx`, `ChatAgent.tsx` are at the top level of `components/` (not in subdirectories as some references in this plan imply). Subdirectories include: `chat/`, `changelog/`, `context/`, `github-issues/`, `github-prs/`, `gitlab-issues/`, `gitlab-merge-requests/`, `ideation/`, `linear-import/`, `multi-agent/`, `onboarding/`, `project-settings/`, `roadmap/`, `settings/`, `task-detail/`, `task-form/`, `terminal/`, `workspace/`.

**4. Feedback Components (~10% of UI surface area)**
- `toast.tsx` + `toaster.tsx`: Radix Toast with `bg-card` default and `bg-destructive` variant
- `badge.tsx`: CVA-based with 9 variants (`default`, `secondary`, `destructive`, `outline`, `success`, `warning`, `info`, `purple`, `muted`)
- `progress.tsx`: Radix Progress with `bg-border` track and `bg-primary` indicator
- `AppLoadingOverlay.tsx`, `GlobalDownloadIndicator.tsx`
- `RateLimitIndicator.tsx`, `UsageIndicator.tsx`

**5. Skeuomorphic Material Components (Built but Unused)**
- `design-system/components/Button/MaterialButton.tsx`: Material-aware button with wood/metal/paper/glass variants, `useMaterialComponent` hook integration
- `design-system/components/Card/MaterialCard.tsx`: Material card with material type system
- `design-system/components/Input/MaterialInput.tsx`: Material-aware input
- `design-system/components/Modal/MaterialModal.tsx`: Material-aware modal
- `design-system/hooks/index.ts`: `useMaterialStyles`, `useInteractionStates`, `useAnimationDuration` hooks
- `design-system/utils/materialHelpers.ts`: Material class/property generation utilities

### 1.2 Current Material System (Partially Implemented — Verified Status)

The application has a **comprehensive but disconnected skeuomorphic foundation** in `apps/frontend/src/renderer/design-system/`:

#### Existing Material Token Files (All Verified Present)

| Token File | Location | Status |
|---|---|---|
| `materials.css` | `design-system/tokens/materials.css` | ✅ Defined — 5 material families (Paper, Metal, Wood, Glass, Fabric) with 3 variants each. Includes highlight/shadow/grain sub-tokens. |
| `elevation.css` | `design-system/tokens/elevation.css` | ✅ Defined — Full 13-level (0-12) elevation hierarchy with material-specific mappings and component assignments. |
| `motion.css` | `design-system/tokens/motion.css` | ✅ Defined — Material-specific durations, physics-based easing functions, and interaction timing tokens. |
| `spacing.css` | `design-system/tokens/spacing.css` | ✅ Defined — Base 4px unit scale with material-specific spacing adjustments (paper, metal, wood, glass, fabric). |
| `typography.css` | `design-system/tokens/typography.css` | ✅ Defined — Material-aware font families, size scale, weight system. |
| `radius.css` | `design-system/tokens/radius.css` | ✅ Defined — Material-appropriate border radius tokens. |

#### Material Utility Layer (Verified Present)
- `design-system/utils/materials.css`: Provides `.material-paper-base`, `.material-metal-base`, `.material-wood-base`, `.material-glass-base`, `.material-fabric-base` utility classes. Also includes `.interactive-base` with hover/active/focus/disabled state management.

#### Integration Layer (Verified Present, Partially Theme-Adapted)
- `design-system/index.css`: Imports all token files and maps existing theme variables to material tokens. Contains theme-specific material adaptations for `default`, `dusk`, `ocean` themes.
- **⚠️ GAP (CORRECTED)**: Only 3 of 9 themes have correct material adaptations (`default`, `dusk`, `retro`). 4 themes have material-authenticity violations (`ocean`, `lime`, `neo`, `forest`). 2 themes are entirely missing (`emerald`, `material-darker`). The `design-system/index.css` file needs 6 theme blocks added or corrected.

#### TypeScript Type System (Verified Present)
- `design-system/types.ts`: Complete type definitions including `MaterialType`, `MaterialVariant`, `ElevationLevel` (0-12), `InteractionState`, `MaterialStyle`, and component-specific interfaces.
- **⚠️ GAP (CORRECTED)**: Types define `ComponentType` with 9 entries: `button`, `input`, `card`, `navigation`, `modal`, `tooltip`, `badge`, `progress`, `tab` — NOT 10 as previously stated. Missing from the type system: `switch`, `select`, `checkbox`, `radio-group`, `textarea`, `toast`, `popover`, `combobox`, `alert-dialog`, `scroll-area`, `collapsible`, `separator`, `resizable-panels`, `full-screen-dialog`, `error-boundary`, `label`, `PermissionModePicker`, `dropdown-menu` (18 component types missing).
- **⚠️ CORRECTED (NO NAMING MISMATCH)**: `MaterialVariant` in `types.ts` defines metal variants as `platinum | steel | titanium` and wood variants as `walnut | mahogany | oak`. The CSS tokens in `materials.css` use **the same naming convention**: `--material-metal-platinum`, `--material-metal-steel`, `--material-metal-titanium`, `--material-wood-walnut`, `--material-wood-mahogany`, `--material-wood-oak`. **There is no naming mismatch between TypeScript types and CSS tokens.** An earlier draft of this plan incorrectly claimed CSS tokens used `aluminum`, `dark-steel`, and `cherry` — those names do not appear anywhere in the codebase (`materials.css`, `index.css`, `types.ts`, or `materialHelpers.ts`). The `design-system/index.css` theme overrides also use the canonical names (e.g., `--material-wood-walnut`, `--material-metal-steel`). The plan's §2.1.1 Tier 1 token examples must be corrected to remove phantom `aluminum`/`dark-steel`/`cherry` references.

#### React Hooks (Verified Present)
- `design-system/hooks/index.ts`: `useMaterialStyles()`, `useInteractionStates()`, `useMaterialComponent()`, `useAnimationDuration()` — all implemented with proper memoization.

#### Current Elevation System (Verified)
- 13-level elevation hierarchy (0-12) with multi-shadow definitions
- Material-specific elevation mappings (paper: flat→floating, metal: control→panel, wood: button→feature, glass: overlay→system, fabric: background→texture)
- Component-specific elevation assignments defined in `elevation.css`
- **⚠️ GAP**: Responsive elevation limits mentioned in plan but not implemented in any CSS file

#### CSS-Based Texture Patterns (Verified)
- `materials.css` defines texture variables: `--texture-paper-fiber`, `--texture-metal-brushed`, `--texture-wood-grain`, `--texture-fabric-linen`, `--texture-fabric-canvas`
- Performance-optimized using CSS gradients (verified: max 2-3 gradients per texture)
- **⚠️ GAP**: Texture patterns are defined but `--texture-glass-*` is missing — glass relies solely on `backdrop-filter`

### 1.3 Identified UI Pattern Inconsistencies (Verified Against Codebase)

> Each inconsistency is a prerequisite blocker for the §1C User Flow acceptance criteria and §1B Screen Specification compliance.

#### Critical Inconsistencies

**1. Three Disconnected Design Systems (SEVERITY: CRITICAL)**
- **Issue**: The codebase contains three independent design systems that don't share tokens, types, or components:
  - `.design-system/` — Standalone Vite app with its own `Inter` font stack, separate color tokens, and independent component implementations (`Button.tsx`, `Card.tsx`, `Input.tsx`, etc.)
  - `apps/frontend/src/renderer/design-system/` — In-app material system with CSS tokens, TypeScript types, React hooks, and 4 material components (MaterialButton, MaterialCard, MaterialInput, MaterialModal)
  - `apps/frontend/src/renderer/components/ui/` — Active Radix/CVA-based component library that the actual application uses
- **Impact**: Zero material components are consumed by the running application. All material tokens, hooks, and utilities are dead code.
- **Resolution Required**: Clear migration path from `ui/` components to material-wrapped equivalents, or a composition strategy where material styling layers onto existing Radix primitives.

**1a. L5 Feature Components Directly Import L2 Radix (SEVERITY: HIGH — Layering Violation)**
- **Issue**: 7 feature-level (L5) components directly import `@radix-ui/react-dialog` instead of consuming the L4 `Dialog` wrapper from `components/ui/dialog.tsx`. This violates the canonical dependency contract (L5 → L4 only).
- **Affected Files** (verified via codebase grep):
  - `components/ImageUpload.tsx` — imports `@radix-ui/react-dialog`
  - `components/chat/AttachmentTray.tsx` — imports `@radix-ui/react-dialog`
  - `components/chat/messages/ImageAttachmentCard.tsx` — imports `@radix-ui/react-dialog`
  - `components/multi-agent/StartSessionDialog.tsx` — imports `@radix-ui/react-dialog`
  - `components/task-detail/TaskDetailModal.tsx` — imports `@radix-ui/react-dialog`
  - `components/task-form/ImagePreviewModal.tsx` — imports `@radix-ui/react-dialog`
  - `components/task-form/TaskModalLayout.tsx` — imports `@radix-ui/react-dialog`
- **Impact**: These 7 files will NOT receive material styling when the L4 barrel swap occurs. They bypass the L4 wrapper entirely and must be individually migrated.
- **Resolution Required**: Each file must be refactored to import `Dialog`, `DialogContent`, `DialogOverlay`, etc. from `@/components/ui/dialog` instead of `@radix-ui/react-dialog`. This is a **Phase 2 prerequisite** — these files must be fixed before the barrel swap for Dialog, or they will remain flat while the rest of the app transitions to material.
- **Migration Effort**: Low complexity per file (import path swap + verify prop compatibility); 7 files total; estimate 2-4 hours.

**1b. Barrel File (`components/ui/index.ts`) Incomplete Coverage (SEVERITY: MEDIUM)**
- **Issue**: The barrel file re-exports only 15 of 27 UI primitives. Missing exports:
  - `checkbox`, `radio-group`, `alert-dialog`, `dropdown-menu`, `popover`, `collapsible`, `toast`, `toaster`, `resizable-panels`, `full-screen-dialog`, `error-boundary`, `PermissionModePicker`
- **Impact**: Components not in the barrel file are imported via direct path (e.g., `from './ui/checkbox'`). The barrel-swap migration strategy assumes ALL components flow through `index.ts`. Components missing from the barrel file will need individual import-path updates across all consumers, significantly increasing migration scope.
- **Resolution Required**: Phase 1 prerequisite — add all 27 primitives to `components/ui/index.ts` before any barrel-swap migration begins. Audit all L5 consumers to ensure they import from the barrel, not direct paths.

**2. Material-to-Theme Authenticity Violations (SEVERITY: HIGH)**
- **Issue**: Theme-specific material adaptations in `design-system/index.css` break material authenticity by assigning non-material colors to wood tokens:
  - `ocean` theme: `--material-wood-walnut: #4682B4` (steel blue — not wood)
  - `lime` theme: `--material-wood-walnut: #9ACD32` (yellow-green — not wood)
  - `neo` theme: `--material-wood-walnut: #FF6347` (tomato red — not wood)
  - `forest` theme: `--material-wood-walnut: #228B22` (forest green — not wood)
  - `emerald` theme: **NO MATERIAL OVERRIDES AT ALL** — falls back to `:root` defaults, which may conflict with theme's green accent (#059669) and light background (#FAFAF9)
  - `material-darker` theme: **NO MATERIAL OVERRIDES AT ALL** — falls back to `:root` defaults, which may conflict with theme's deep orange accent (#E65100) and warm background (#FFF8F0)
- **Impact**: The 60/25/10/4/1 material hierarchy is meaningless when "wood" is colored blue or green. Users lose the tactile mental model. The 2 missing themes will render material components with jarring color mismatches against their theme palettes.
- **Resolution Required**: Wood must retain warm brown hue range across all themes. Theme influence should affect accent/tinting, not replace the material's identity. `emerald` and `material-darker` need complete `[data-theme="..."]` blocks in `design-system/index.css` with material-authentic overrides.

**3. CSS Syntax Error in Theme Token (SEVERITY: MEDIUM)**
- **Issue**: In `design-system/index.css`, the forest theme contains an invalid CSS value: `--material-paper-cream: #HONEYDEW;` — `#HONEYDEW` is not a valid hex color.
- **Impact**: This token will be ignored by the browser, falling back to the `:root` default.
- **Resolution Required**: Change to `--material-paper-cream: #F0FFF0;` (honeydew in hex).

**4. Neo Theme Paper Inversion (SEVERITY: HIGH)**
- **Issue**: Neo theme defines paper colors as dark values (`--material-paper-white: #1C1C1C`, `--material-paper-cream: #2F2F2F`, `--material-paper-aged: #404040`). This inverts the light/dark contract — paper should always feel like paper.
- **Impact**: Text on "paper" surfaces in neo theme would need to be light-on-dark, breaking the reading metaphor.
- **Resolution Required**: Even in dark themes, paper materials should be relatively lighter surfaces (dark cream, not near-black).

**5. Material Usage Hierarchy Not Enforced (SEVERITY: HIGH)**
- **Issue**: The 60/25/10/4/1 material distribution rule is documented but impossible to enforce because no component in `ui/` uses material tokens. All 27 primitive components use Tailwind semantic color classes (`bg-card`, `bg-primary`, `bg-secondary`) which have no relationship to material types.
- **Current State**: Every card uses `bg-card`, every button uses `bg-primary` — there is no material differentiation whatsoever.
- **Impact**: No visual hierarchy based on material authenticity exists in the running application.

**6. Elevation Inconsistencies (SEVERITY: MEDIUM)**
- **Issue**: The active component system uses flat shadow tokens (`--shadow-sm/md/lg/xl`) from `globals.css` while the material system defines a 13-level elevation hierarchy in `design-system/tokens/elevation.css`. These are completely separate systems.
- **Current State**: `dialog.tsx` uses `shadow-xl`; `card.tsx` has no default shadow; `toast.tsx` uses `shadow-lg`; buttons have no shadow at all — arbitrary and inconsistent.
- **Impact**: Users cannot predict interaction affordances from visual depth cues.

**7. Texture Application Gap (SEVERITY: HIGH)**
- **Issue**: Texture patterns (`--texture-paper-fiber`, `--texture-metal-brushed`, `--texture-wood-grain`, etc.) are defined in `materials.css` and referenced in `materials.css` utility classes, but no running component applies them.
- **Current State**: All surfaces are flat solid colors via Tailwind classes.
- **Impact**: The application looks and feels entirely flat despite having a complete texture system built.

**8. Interactive State Material Transitions (SEVERITY: MEDIUM)**
- **Issue**: The active `button.tsx` uses `active:scale-[0.98]` (a generic scale transform) for press feedback. The material system defines physics-based compression distances per material (`--physics-wood-compress: 2px`, `--physics-metal-compress: 1px`, etc.) — none of which are used.
- **Current State**: All interactive elements share the same generic transition behavior regardless of their intended material.
- **Impact**: Interactions feel uniformly digital rather than material-specific.

**9. Font Stack Divergence (SEVERITY: LOW)**
- **Issue**: Three different font stacks are declared:
  - `globals.css`: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI'`
  - `design-system/tokens/typography.css`: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI'`
  - `.design-system/src/styles.css`: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI'`
- **Impact**: Inconsistent rendering between design system demos and the actual application.

**10. Missing Component Type Coverage (SEVERITY: MEDIUM)**
- **Issue**: `design-system/types.ts` defines `ComponentType` covering 9 component types (`button`, `input`, `card`, `navigation`, `modal`, `tooltip`, `badge`, `progress`, `tab`), but the actual `ui/` directory has 27 primitive components. Missing from the type system: `switch`, `select`, `checkbox`, `radio-group`, `textarea`, `toast`, `popover`, `combobox`, `alert-dialog`, `scroll-area`, `collapsible`, `separator`, `resizable-panels`, `full-screen-dialog`, `error-boundary`, `label`, `PermissionModePicker`, `dropdown-menu` (18 total).
- **Impact**: When migration begins, 18 component types have no material type definitions or elevation assignments.

**11. ~~MaterialVariant Type ↔ CSS Token Naming Mismatch~~ — RESOLVED: No Mismatch Exists (SEVERITY: RETRACTED)**
- **Issue (CORRECTED)**: An earlier audit draft incorrectly claimed that TypeScript types used `platinum`/`titanium`/`oak` while CSS tokens used `aluminum`/`dark-steel`/`cherry`. **Codebase verification confirms both TypeScript (`design-system/types.ts`) and CSS (`design-system/tokens/materials.css`, `design-system/index.css`) use the identical naming convention**: metal variants are `platinum | steel | titanium`, and wood variants are `walnut | mahogany | oak`. The names `aluminum`, `dark-steel`, and `cherry` do not appear anywhere in the codebase — not in any `.css`, `.ts`, or `.tsx` file.
- **Impact**: None. TypeScript types and CSS tokens are already in sync. No bridging logic is needed in `getMaterialClasses()`.
- **Resolution Required**: Remove phantom `aluminum`/`dark-steel`/`cherry` references from §2.1.1 Tier 1 token examples and from the Primitive Variant & Visual State Contracts table (§1.4) which reference `--material-metal-aluminum-base`, `--material-metal-dark-steel-base`, and `--material-wood-cherry-base`. Replace all occurrences with the actual token names: `--material-metal-platinum`, `--material-metal-steel`, `--material-metal-titanium`, `--material-wood-walnut`, `--material-wood-mahogany`, `--material-wood-oak`.
- **Remaining concern**: The plan's §2.1.1 Tier 1 examples introduced three phantom token names that never existed. These must be corrected to prevent implementers from creating CSS custom properties that don't match the token system.

**12. Barrel File Missing 12 Component Exports — Migration Strategy Undermined (SEVERITY: HIGH)**
- **Issue**: `components/ui/index.ts` only exports 15 components: `badge`, `button`, `card`, `combobox`, `dialog`, `input`, `label`, `progress`, `scroll-area`, `select`, `separator`, `switch`, `tabs`, `textarea`, `tooltip`. Missing exports: `checkbox`, `radio-group`, `alert-dialog`, `dropdown-menu`, `popover`, `collapsible`, `toast`, `toaster`, `resizable-panels`, `full-screen-dialog`, `error-boundary`, `PermissionModePicker`.
- **Impact**: The barrel-swap migration strategy (§1A) assumes `components/ui/index.ts` is the single control point for all L4 exports. **Audit reveals ~40+ direct-path imports across ~30+ L5 files** that bypass the barrel for the 12 missing components (e.g., `from '../ui/checkbox'`, `from '../../ui/collapsible'`, `from '../../ui/alert-dialog'`). Major consumers include: `checkbox` (11 import sites), `collapsible` (8 sites), `alert-dialog` (7 sites), `dropdown-menu` (3 sites), `popover` (3 sites), `PermissionModePicker` (3 sites), `full-screen-dialog` (2 sites), `resizable-panels` (1 site), `error-boundary` (1 site). These will ALL bypass the barrel swap and remain flat unless import paths are migrated first.
- **Resolution Required**: Phase 1 prerequisite: (a) Add all 27 exports to `index.ts`, (b) **Migrate all ~40+ direct-path imports** in L5 consumers to use the barrel path (`@/components/ui` or `./ui`), (c) Add ESLint `no-restricted-imports` rule blocking direct `./ui/{component}` imports from L5.

#### Component-Level Inconsistencies (Verified)

**Sidebar Navigation Issues:**
- Uses `Button` from `ui/button.tsx` with `variant="ghost"` — no material backing surfaces
- Icon rendering via Lucide React with no etched/embossed treatment
- Active state differentiated by background color (`bg-accent`) only — no depth or material change
- Missing tactile button feedback (currently relies on generic `active:scale-[0.98]`)

**TaskCard Issues:**
- Built on `Card` from `ui/card.tsx` which provides `rounded-xl border border-border bg-card` — pure flat styling
- Status badges use CVA `Badge` component with color-only variants — no material authenticity
- Priority indicators are colored badges, not metal plates or carved markers
- Progress display uses `PhaseProgressIndicator` with standard HTML/CSS — no material metaphor
- Category icons are plain Lucide icons without material surface treatment

**Button System Issues:**
- `ui/button.tsx` defines 9 variants but none map to materials. `MaterialButton.tsx` exists with proper wood/metal/paper/glass mapping but is unused.
- The gap between systems: `ui/button.tsx` uses `bg-primary text-primary-foreground` while `MaterialButton.tsx` uses `bg-gradient-to-b from-amber-600 via-amber-700 to-amber-800` with grain textures.
- No plan exists for transitioning callers from `<Button variant="default">` to `<MaterialButton variant="primary">`.

**Modal/Dialog Issues:**
- `dialog.tsx` uses `bg-black/80 backdrop-blur-sm` for overlay — glass material tokens exist but are not used
- Modal content uses `bg-card border border-border shadow-xl` — not glass material
- `MaterialModal.tsx` exists with proper glass material implementation but is unused
- No realistic depth relationships between modal layers

**Form Element Issues:**
- `input.tsx`: `bg-card border border-border` with `focus:ring-2 ring-ring` — no inset metal frame, no paper content area
- `select.tsx`: Same flat styling as input
- `switch.tsx`: Simple toggle with `bg-primary`/`bg-border` states — no material metaphor (should feel like a metal toggle)
- `textarea.tsx`: Same pattern as input — no material differentiation
- `checkbox.tsx`, `radio-group.tsx`: Basic Radix primitives with border styling — no embossed/etched appearance

**Tab System Issues:**
- `tabs.tsx`: `bg-secondary` list background, `bg-card` active tab — no wood/metal material differentiation
- `ProjectTabBar.tsx`: Uses sortable tabs but with same flat styling
- No "raised wood panel" active state as the plan specifies

### 1.5 Audit-Derived Phase 1 Prerequisites (Must Complete Before Any Migration)

> **⚠️ BLOCKING PREREQUISITES** — The following items were identified during the codebase audit and MUST be resolved before Phase 2 migration can begin. These are not optional improvements; they are structural requirements for the barrel-swap strategy to function.

| # | Prerequisite | Effort | Blocking |
|---|-------------|--------|----------|
| P1 | **Complete barrel file**: Add 12 missing exports to `components/ui/index.ts` | 1 hour | All barrel-swap migrations |
| P2 | **Fix L5 Radix violations**: Refactor 7 files to import Dialog from `@/components/ui/dialog` instead of `@radix-ui/react-dialog` | 2-4 hours | Dialog barrel swap (Wave 1) |
| P3 | **Add 2 missing theme blocks**: Create `[data-theme="emerald"]` and `[data-theme="material-darker"]` sections in `design-system/index.css` with material-authentic overrides | 2 hours | All material rendering on those themes |
| P4 | **Fix `#HONEYDEW`**: Change to `#F0FFF0` in `design-system/index.css` forest theme | 5 minutes | Forest theme paper rendering |
| P5 | ~~**Reconcile TypeScript ↔ CSS naming**~~: **RETRACTED** — codebase audit confirms both TypeScript types and CSS tokens already use the same naming convention (`platinum`/`steel`/`titanium` for metal, `walnut`/`mahogany`/`oak` for wood). No reconciliation needed. Instead: **Correct phantom references in this plan document** — replace `aluminum`/`dark-steel`/`cherry` with actual token names throughout §2.1.1 and §11. | 30 min (plan edits only) | Plan accuracy; implementer confusion prevention |
| P6 | **Extend `ComponentType`**: Add 18 missing component types to `design-system/types.ts` | 1 hour | Wave 2-5 wrapper implementations |
| P7 | **Audit L5 import paths**: Ensure all L5 consumers import from barrel (`@/components/ui`) not direct paths (`./ui/checkbox`) | 2-3 hours | Barrel-swap effectiveness |

**Total estimated effort**: 8-12 hours (1-2 developer days)
**Critical path**: P1 and P2 must complete before any Wave 1 barrel swap. P3 must complete before theme-matrix contrast validation.

### 1A. Target Architecture — Module-to-Layer Migration Mapping

> The canonical 5-layer architecture, dependency matrix, concrete import examples, and enforcement rules are defined in **Visual Architecture Decisions** at the top of this document. This section maps every current codebase module to its target layer.

#### Current Module → Target Layer Migration Map

Every file in the codebase maps to exactly one canonical layer. This table is the definitive migration guide.

| Current File/Directory | Current State | Target Layer | Migration Action | Phase |
|----------------------|---------------|-------------|-----------------|-------|
| `design-system/tokens/materials.css` | Defined, unused | **L1 — Tokens** (canonical) | Promote: no changes needed; begin consuming from L4 wrappers | Immediate |
| `design-system/tokens/elevation.css` | Defined, unused | **L1 — Tokens** (canonical) | Promote: replace `globals.css` shadow tokens with L1 elevation tokens | Phase 1 |
| `design-system/tokens/motion.css` | Defined, unused | **L1 — Tokens** (canonical) | Promote: replace hardcoded `transition` values in L4/L5 with token refs | Phase 1 |
| `design-system/tokens/spacing.css` | Defined, unused | **L1 — Tokens** (canonical) | Promote: integrate into Tailwind config as spacing extensions | Phase 1 |
| `design-system/tokens/typography.css` | Defined, unused | **L1 — Tokens** (canonical) | Promote: resolve font-stack conflict (use system font stack, not `Inter`) | Phase 1 |
| `design-system/tokens/radius.css` | Defined, unused | **L1 — Tokens** (canonical) | Promote: replace `--radius-*` in `globals.css` with L1 tokens | Phase 1 |
| `@radix-ui/*` (node_modules) | Active, consumed by L4 | **L2 — Radix** (unchanged) | No migration; pin version; L5 must stop direct imports | — |
| `class-variance-authority` (node_modules) | Active, consumed by L4 | **L2 — CVA** (unchanged) | No migration; remains L4-internal; L5 must not import directly | — |
| `design-system/components/MaterialButton.tsx` | Built, unused | **L3 — Material Primitives** (canonical) | Promote: consumed by new `components/ui/material-button.tsx` wrapper | Phase 2 |
| `design-system/components/MaterialCard.tsx` | Built, unused | **L3 — Material Primitives** (canonical) | Promote: consumed by new `components/ui/material-card.tsx` wrapper | Phase 2 |
| `design-system/components/MaterialInput.tsx` | Built, unused | **L3 — Material Primitives** (canonical) | Promote: consumed by new `components/ui/material-input.tsx` wrapper | Phase 2 |
| `design-system/components/MaterialModal.tsx` | Built, unused | **L3 — Material Primitives** (canonical) | Promote: consumed by new `components/ui/material-dialog.tsx` wrapper | Phase 2 |
| `design-system/hooks/index.ts` | Built, unused | **L3 — Material Primitives** (canonical) | Promote: `useMaterialStyles`, `useMaterialComponent`, `useAnimationDuration` consumed by L4 | Phase 2 |
| `design-system/utils/materialHelpers.ts` | Built, unused | **L3 — Material Primitives** (canonical) | Promote: consumed by L4 wrappers for class generation | Phase 2 |
| `design-system/utils/materials.css` | Built, unused | **L3 — Material Primitives** (canonical) | Promote: `.material-*-base` classes consumed by L4 CSS | Phase 2 |
| `design-system/types.ts` | Built, incomplete | **L3 — Material Primitives** | Extend: add missing 18 component types (see §1.3 #10); reconcile `MaterialVariant` naming with CSS tokens (see §1.3 #11) | Phase 1 |
| `components/ui/button.tsx` | Active (flat) | **L4 — UI Wrappers** (migrating) | Barrel swap: export `MaterialButton as Button` from `material-button.tsx` | Phase 2, Wave 1 |
| `components/ui/card.tsx` | Active (flat) | **L4 — UI Wrappers** (migrating) | Barrel swap: export `MaterialCard as Card` from `material-card.tsx` | Phase 2, Wave 1 |
| `components/ui/input.tsx` | Active (flat) | **L4 — UI Wrappers** (migrating) | Barrel swap: export `MaterialInput as Input` from `material-input.tsx` | Phase 2, Wave 1 |
| `components/ui/dialog.tsx` | Active (flat) | **L4 — UI Wrappers** (migrating) | Barrel swap: export `MaterialDialog as Dialog` from `material-dialog.tsx` | Phase 2, Wave 1 |
| `components/ui/{badge,select,tabs,...}.tsx` | Active (flat) | **L4 — UI Wrappers** (migrating) | Create new `material-*.tsx` wrappers; barrel swap per Wave 2-5 schedule | Phase 2-3 |
| `components/ui/index.ts` | Barrel file (15 of 27 exports) | **L4 — UI Wrappers** (migration control point) | **Phase 1 prerequisite**: Add missing 12 exports (`checkbox`, `radio-group`, `alert-dialog`, `dropdown-menu`, `popover`, `collapsible`, `toast`, `toaster`, `resizable-panels`, `full-screen-dialog`, `error-boundary`, `PermissionModePicker`); then feature-flag controlled: swap flat → material exports per-component | Phase 1 (complete barrel), Phase 2-3 (barrel swap) |
| `components/chat/*.tsx` | Active | **L5 — Features** (no change) | No import changes needed for barrel-consumed components; **⚠️ however**, `AttachmentTray.tsx` and `messages/ImageAttachmentCard.tsx` directly import `@radix-ui/react-dialog` — refactor to use `@/components/ui/dialog` | Phase 2 |
| `components/KanbanBoard.tsx`, `components/TaskCard.tsx`, `components/SortableTaskCard.tsx` etc. (top-level) | Active | **L5 — Features** (no change) | No import changes; material styling arrives via L4 barrel swap. ⚠️ Note: These files are at the top level of `components/`, NOT in a `kanban/` subdirectory. | — |
| `components/settings/*.tsx` | Active | **L5 — Features** (no change) | No import changes; audit for any direct `design-system/` or `@radix-ui/` imports and remove | Phase 2 |
| `components/task-detail/TaskDetailModal.tsx` | Active (L2 violation) | **L5 — Features** | **⚠️ Directly imports `@radix-ui/react-dialog`** — refactor to use `@/components/ui/dialog` | Phase 2 prerequisite |
| `components/task-form/ImagePreviewModal.tsx` | Active (L2 violation) | **L5 — Features** | **⚠️ Directly imports `@radix-ui/react-dialog`** — refactor to use `@/components/ui/dialog` | Phase 2 prerequisite |
| `components/task-form/TaskModalLayout.tsx` | Active (L2 violation) | **L5 — Features** | **⚠️ Directly imports `@radix-ui/react-dialog`** — refactor to use `@/components/ui/dialog` | Phase 2 prerequisite |
| `components/multi-agent/StartSessionDialog.tsx` | Active (L2 violation) | **L5 — Features** | **⚠️ Directly imports `@radix-ui/react-dialog`** — refactor to use `@/components/ui/dialog` | Phase 2 prerequisite |
| `components/ImageUpload.tsx` | Active (L2 violation) | **L5 — Features** | **⚠️ Directly imports `@radix-ui/react-dialog`** — refactor to use `@/components/ui/dialog` | Phase 2 prerequisite |
| All other `components/**/*.tsx` | Active | **L5 — Features** (no change) | Audit: ensure all import from `@/components/ui` only | Phase 2 |
| `.design-system/` (standalone Vite app) | Deprecated | **Delete** | Freeze immediately; extract unique tokens into L1; delete after Phase 3 | Phase 1 freeze, Phase 4 delete |
| `styles/globals.css` | Active | **L1 migration target** | Replace shadow/radius/color tokens with L1 `design-system/tokens/` refs; keep Tailwind base layers | Phase 1 |
| `design-system/index.css` | Partial theme map | **L1 — Tokens** (canonical) | Complete: add missing theme overrides for `lime`, `retro`, `neo`, `forest`, `emerald`, `material-darker`; fix `#HONEYDEW`; correct wood-color authenticity violations in `ocean`, `lime`, `neo`, `forest` | Phase 1 |

#### Barrel Swap Mechanism (L4 Migration Control)

```typescript
// components/ui/index.ts — the ONLY file that changes during migration
// Feature code (L5) always imports from here and NEVER changes.

// Phase 1: All flat exports (current state)
export { Button } from './button';

// Phase 2+: Feature-flagged material swap
import { getMaterialEnabled } from '@/config/feature-flags';
export const Button = getMaterialEnabled('button')
  ? require('./material-button').MaterialButton
  : require('./button').Button;

// Phase 4: Clean — flat originals removed
export { MaterialButton as Button } from './material-button';
```

#### Deprecation Path Summary

| Module | Status | Timeline |
|--------|--------|----------|
| `.design-system/` (standalone Vite app) | **Deprecated** | Phase 1 freeze → Phase 4 delete |
| `components/ui/*.tsx` (flat Radix wrappers) | **Migrating** | Phase 2-3 barrel swap → Phase 4 remove originals |
| `design-system/` (in-app material system) | **Canonical (L1+L3)** | Promoted immediately |
| `globals.css` shadow/color tokens | **Migrating** | Phase 1: replaced by L1 token refs |

#### Ownership Boundaries

> See also: **Ownership Boundaries & Change Process** in Visual Architecture Decisions (top of document) for the full change protocol and stability guarantees.

| Layer | Owner | Change Process |
|-------|-------|---------------|
| **L1 (Tokens)** | Design System team | Changes require cross-team review; version-bumped |
| **L2 (Radix)** | Upstream dependency | Pin versions; do not fork |
| **L3 (Primitives)** | Design System team | Provides material behaviors; API changes require RFC |
| **L4 (Wrappers)** | Design System team maintains; Feature teams consume | API contract changes require migration guide |
| **L5 (Features)** | Feature teams own | Must import L4 only; audit enforced in CI |

### 1.4 Component → Implementation → Planned Redesign → Gap (Verified Mapping)

This table maps every active UI primitive to its current implementation, planned material treatment, and migration gap status.

| Component | Current File | Planned Material | Exists? | Adapter/Facade Strategy | Backward-Compat API Contract | Migration Owner Module |
|---|---|---|---|---|---|---|
| Button | `ui/button.tsx` | Wood (primary), Metal (secondary) | ✅ | `MaterialButton` wraps Radix via `forwardRef`; maps `variant` prop to material type | All existing `ButtonProps` preserved; `material` prop optional (defaults by variant) | `components/ui/` |
| Card | `ui/card.tsx` | Paper with fiber texture | ✅ | `MaterialCard` wraps existing Card; adds texture via CSS class | `CardProps` unchanged; `materialVariant` optional | `components/ui/` |
| Input | `ui/input.tsx` | Metal frame + Paper content | ✅ | `MaterialInput` wraps Radix input; metal frame via `::before` pseudo | `InputProps` unchanged; frame added via CSS only | `components/ui/` |
| Dialog | `ui/dialog.tsx` | Glass overlay + Paper content | ✅ | `MaterialModal` wraps Radix Dialog; glass backdrop via material class | Radix Dialog API preserved; glass styling additive | `components/ui/` |
| Badge | `ui/badge.tsx` | Metal nameplate | ❌ | New `MaterialBadge` wraps CVA Badge; metal texture via CSS class | `BadgeProps` preserved; adds `material` prop | `components/ui/` |
| Select | `ui/select.tsx` | Metal frame + Paper content | ❌ | New wrapper around Radix Select; metal frame container | Radix Select API preserved; frame additive | `components/ui/` |
| Switch | `ui/switch.tsx` | Metal toggle lever | ❌ | New wrapper around Radix Switch; metal track + wood knob | Radix Switch API preserved | `components/ui/` |
| Tabs | `ui/tabs.tsx` | Metal rail + Wood active tab | ❌ | New wrapper around Radix Tabs; material classes per state | Radix Tabs API preserved | `components/ui/` |
| Checkbox | `ui/checkbox.tsx` | Metal frame + etched check | ❌ | New wrapper around Radix Checkbox; metal frame CSS | Radix Checkbox API preserved | `components/ui/` |
| Radio Group | `ui/radio-group.tsx` | Metal frame + embossed dot | ❌ | New wrapper around Radix RadioGroup | Radix RadioGroup API preserved | `components/ui/` |
| Textarea | `ui/textarea.tsx` | Metal frame + Paper content | ❌ | Same pattern as Input; metal frame container | `TextareaProps` preserved | `components/ui/` |
| Progress | `ui/progress.tsx` | Metal rail + Wood slider | ❌ | New wrapper around Radix Progress; metal/wood via CSS | Radix Progress API preserved | `components/ui/` |
| Toast | `ui/toast.tsx` | Wood panel notification | ❌ | New wrapper around Radix Toast; wood panel CSS | Radix Toast API preserved | `components/ui/` |
| Tooltip | `ui/tooltip.tsx` | Glass tooltip | ❌ | New wrapper around Radix Tooltip; glass material class | Radix Tooltip API preserved | `components/ui/` |
| Dropdown Menu | `ui/dropdown-menu.tsx` | Metal frame menu | ❌ | New wrapper around Radix DropdownMenu | Radix DropdownMenu API preserved | `components/ui/` |
| Popover | `ui/popover.tsx` | Glass popover | ❌ | New wrapper around Radix Popover; glass class | Radix Popover API preserved | `components/ui/` |
| Alert Dialog | `ui/alert-dialog.tsx` | Glass overlay + Paper content | ❌ | Same pattern as Dialog | Radix AlertDialog API preserved | `components/ui/` |
| Scroll Area | `ui/scroll-area.tsx` | Metal scrollbar track | ❌ | New wrapper; metal scrollbar via CSS custom scrollbar | Radix ScrollArea API preserved | `components/ui/` |
| Separator | `ui/separator.tsx` | Material-appropriate divider | ❌ | Thin wrapper; material class based on parent surface | Radix Separator API preserved | `components/ui/` |
| Combobox | `ui/combobox.tsx` | Metal frame + Paper list | ❌ | Composite: metal input frame + glass overlay + paper items | Existing Combobox API preserved | `components/ui/` |
| Collapsible | `ui/collapsible.tsx` | Paper fold/unfold | ❌ | New wrapper; paper fold animation on expand/collapse | Radix Collapsible API preserved | `components/ui/` |

**Migration Rule**: Every wrapper must accept all props from the original component. Feature modules (`TaskCard`, `KanbanBoard`, etc.) must NOT change their imports — the wrapper replaces the original export at the `ui/` barrel file level.

**Wrapper API Contract Guarantees** (per-component, non-negotiable):
1. **Type Compatibility**: `MaterialXProps extends OriginalXProps` — all original props accepted, new `material?` prop is optional with sensible defaults
2. **Event Parity**: All `onChange`, `onClick`, `onFocus`, `onBlur` etc. fire with identical payloads and timing
3. **Ref Forwarding**: All wrappers use `React.forwardRef` — DOM ref points to the same element type as original
4. **className Passthrough**: Custom `className` prop is merged (not replaced) with material classes
5. **Test Compatibility**: All existing component tests pass without modification when the barrel swap occurs
6. **Render Output**: DOM structure is identical or strictly superset (wrapper div allowed, removed children forbidden)

**Migration Mechanics — Per-Component Protocol**:

1. **Create**: New `material-{component}.tsx` file in `components/ui/` that wraps Radix primitive via `forwardRef` + `design-system/` hooks
2. **Test**: Run existing component tests against the new wrapper to verify API compatibility (all existing tests must pass unchanged)
3. **Feature-Flag**: Wrap in `withMaterialMigration()` HOC (see §9.2) — flag off by default
4. **Barrel Swap**: When flag enabled, `components/ui/index.ts` exports the material wrapper instead of the original
5. **Rollout**: Enable flag per-component, monitor for errors/performance regression
6. **Cleanup**: After 2 weeks stable, remove feature flag and original component file

**Rollout Order** (based on UI surface coverage × implementation risk):

| Wave | Components | Rationale |
|------|-----------|-----------|
| Wave 1 (highest impact) | Button, Card, Input, Dialog | 4 already have material implementations; highest visibility |
| Wave 2 (navigation) | Tabs, Sidebar items, Badge, Select | Core navigation experience; moderate risk |
| Wave 3 (forms) | Checkbox, Radio, Switch, Textarea, Progress | Form consistency; lower visual impact |
| Wave 4 (overlays) | Toast, Tooltip, Popover, Dropdown, Alert Dialog | Overlay system; glass material dependency |
| Wave 5 (utilities) | Scroll Area, Separator, Collapsible, Combobox | Lowest visibility; wrap-only changes |

#### Primitive Variant & Visual State Contracts

> **Mandatory**: Each primitive MUST implement ALL standardized states listed below with the specified token references. Minimum interactive touch target: **44×44px** (enforced via CSS `min-width`/`min-height` and validated in CI). No component may ship without all state columns defined. Timing values reference tokens from `design-system/tokens/motion.css`. Elevation values reference `design-system/tokens/elevation.css`. Material colors reference `design-system/tokens/materials.css`.
>
> **Shadow/Elevation Transitions**: On hover, elevation increases by exactly 1 level (e.g., Level 2 → Level 3). On active/press, elevation decreases by 1-2 levels (e.g., Level 2 → Level 0 inset). On focus, elevation stays at rest level; focus ring is additive. All elevation transitions use the component's material timing function.
>
> **Motion Timing Reference** (from `motion.css`):
> - Wood: `var(--timing-wood-interaction)` = `cubic-bezier(0.4, 0.0, 0.2, 1)`, 300ms default
> - Metal: `var(--timing-metal-interaction)` = `cubic-bezier(0.25, 0.46, 0.45, 0.94)`, 200ms default
> - Paper: `var(--timing-paper-interaction)` = `cubic-bezier(0.25, 0.46, 0.45, 0.94)`, 250ms default
> - Glass: `var(--timing-glass-interaction)` = `cubic-bezier(0.4, 0.0, 0.6, 1)`, 300ms default

| Primitive | Variants | Default State | Hover | Active | Focus | Disabled | Loading |
|---|---|---|---|---|---|---|---|
| **Button (wood)** | primary, icon | `bg: var(--material-wood-walnut-base)`; `shadow: var(--elevation-2)`; `radius: 8px`; `min-h: 44px` | `brightness: 1.1`; `shadow: var(--elevation-3)`; `lift: -1px`; `300ms var(--timing-wood-interaction)` | `translateY: var(--physics-wood-compress)`; `brightness: 0.85`; `shadow: var(--elevation-0) + inset`; `50ms` | `ring: 3px var(--focus-wood-color, #FF8C00)/60%`; `pulse: 2s` | `saturate: 50%`; `brightness: 0.8`; `cursor: not-allowed`; `pointer-events: none` | `wood-shine keyframe 2s infinite`; content replaced with spinner |
| **Button (metal)** | secondary, tertiary, icon | `bg: var(--material-metal-steel-base) + var(--texture-metal-brushed-horizontal)`; `shadow: var(--elevation-2)`; `radius: 8px`; `min-h: 44px` | `reflection: +20%`; `shadow: var(--elevation-3)`; `200ms var(--timing-metal-interaction)` | `translateY: var(--physics-metal-compress)`; `brightness: 0.9`; `shadow: inset`; `50ms` | `ring: 3px var(--focus-metal-color, #4A90E2)/70%`; `pulse: 2s` | `saturate: 50%`; tarnished appearance; `pointer-events: none` | `metal-sweep keyframe 1.5s infinite` |
| **Card (paper)** | content, interactive, elevated | `bg: var(--material-paper-cream-base) + var(--texture-paper-fiber-fine)`; `shadow: var(--elevation-2)`; `radius: 12px` | `shadow: var(--elevation-3)`; `lift: -2px`; `200ms var(--timing-paper-interaction)` | `shadow: var(--elevation-1)`; `brightness: 0.95` | `ring: 2px var(--focus-paper-color, #666)/50%` | `yellowed tint via filter: sepia(0.1)`; reduced fiber opacity | `paper-read keyframe 2.5s infinite` |
| **Input (metal+paper)** | text, search, textarea | `frame: var(--material-metal-platinum) inset`; `content: var(--material-paper-cream)`; `radius: 6px`; `min-h: 44px` | `frame brightness: 1.05` | — | `inner ring: 2px var(--input-focus-glow-color)`; `glow: 3px` | `frame: tarnished (saturate: 0.5)`; `content: aged paper (sepia: 0.1)` | — |
| **Switch (metal+wood)** | default | `track: var(--material-metal-steel)`; `thumb: var(--material-wood-oak)`; `radius: full`; `min-h: 44px` (includes padding) | `track brightness: 1.05` | `thumb compress: var(--physics-metal-compress)` | `ring: 3px var(--focus-metal-color)/70%` on track | `saturate: 50%` both; `pointer-events: none` | — |
| **Select (metal+glass)** | default, searchable | `trigger: var(--material-metal-platinum) frame`; `content: glass overlay + paper items`; `min-h: 44px` | `trigger brightness: 1.05` | `trigger: inset shadow` | `ring: 3px var(--focus-metal-color)/70%` | `tarnished frame`; `pointer-events: none` | — |
| **Toast (paper)** | info, success, warning, error | `bg: var(--material-paper-aged-base) + fiber`; `shadow: var(--elevation-4)`; `radius: 8px`; intent-colored left accent (4px border) | Auto-dismiss 5s; swipe-to-dismiss on touch | — | — | — | — |
| **Badge (metal)** | status, count | `bg: var(--material-metal-titanium)`; `shadow: var(--elevation-1)`; `radius: 4px`; etched text via `text-shadow: inset` | `brightness: 1.1` | — | — | `tarnished (saturate: 0.5)` | — |
| **Tooltip (glass)** | default | `bg: var(--material-glass-tinted-base) (90% opacity)`; `backdrop-filter: blur(6px)`; `shadow: var(--elevation-8)`; `radius: 6px` | — | — | — | — | — |
| **Progress (metal+wood)** | linear, circular | `track: var(--material-metal-steel-base) inset`; `fill: var(--material-wood-walnut-base)`; `radius: full`; `min-h: 8px` (track) | — | — | — | `saturate: 50%` | `wood-shine on fill area` |
| **Separator** | horizontal, vertical | `bg: var(--material-metal-steel-base)`; `height: 1px` (h) or `width: 1px` (v); `opacity: 0.2` | — | — | — | — | — |
| **Scroll Area (metal)** | default | `scrollbar-track: var(--material-metal-steel)`; `scrollbar-thumb: var(--material-metal-platinum)`; `thumb-radius: full`; `min-width: 8px` (thumb) | `thumb brightness: 1.1` | `thumb: darker (brightness: 0.9)` | — | — | — |

### 1B. Screen Specification Matrix

> **Purpose**: Every major application screen is mapped to explicit skeuomorphic treatments per layout zone. Implementers use this matrix as the definitive guide for which material, elevation, spacing, and typography applies to each region of each screen. No screen may ship without conforming to its row in this matrix.

**Responsive Breakpoints** (shared across all screens):
- **Desktop**: ≥ 1200px — full material fidelity, all textures and effects
- **Tablet**: 768px–1199px — simplified textures, material physics preserved, sidebar collapses
- **Compact**: < 768px — essential material identity only, performance-optimized, single-column layout

#### Per-Screen Material Distribution Budgets

> **Per-screen targets below are the canonical source of truth for material distribution validation.** The global 60/25/10/4/1 ratio is a design-intent baseline for new screens not yet in this table — it is NOT enforced as a hard rule on listed screens. Each screen's targets reflect intentional material choices driven by screen function (see "Material Distribution Governance" in the Visual Architecture Decisions section). Tolerance: ±5% per material. Measurement methodology: §8.1.3.

| Screen | Paper % | Metal % | Wood % | Glass % | Fabric % | Rationale |
|--------|---------|---------|--------|---------|----------|-----------|
| **Dashboard / Main View** | 55% | 28% | 12% | 0% | 5% | Heavy nav/controls push metal higher; more wood CTAs |
| **Kanban Board** | 58% | 18% | 8% | 0% | 16% | Cards dominate; fabric column backgrounds |
| **Modal / Dialog** | 50% | 15% | 10% | 25% | 0% | Glass overlay is large; paper content within |
| **Settings** | 60% | 28% | 8% | 0% | 4% | Form-heavy; metal frames for inputs |
| **Chat / Agent View** | 72% | 16% | 8% | 0% | 4% | Message-dominated; heavy paper |
| **Terminal / Console** | 45% | 42% | 3% | 0% | 10% | Metal-heavy industrial aesthetic |
| **File Explorer** | 62% | 25% | 8% | 0% | 5% | Tree structure is paper; controls are metal |
| **Search / Command Palette** | 35% | 15% | 5% | 40% | 5% | Glass overlay dominates |
| **Insights / Analytics** | 65% | 22% | 8% | 0% | 5% | Data-heavy; charts on paper |

#### Dashboard / Main View

| Layout Zone | Material Surface | Elevation | Spacing Scale | Typography Role | Responsive Behavior |
|---|---|---|---|---|---|
| App Background | Fabric (linen) | Level 0 | — | — | Full bleed, all breakpoints |
| Sidebar (left) | Metal (brushed steel) | Level 2 | `--spacing-metal-md` (16px) | Nav labels: 13px/500 | Collapses to icon-only < 1024px |
| Sidebar Active Item | Wood (walnut) inlay | Level 3 | `--spacing-wood-sm` (12px) | Active label: 13px/600 | Tooltip label when collapsed |
| Project Tab Bar (top) | Metal (platinum) rail | Level 2 | `--spacing-metal-sm` (8px) | Tab label: 12px/500 | Horizontal scroll < 768px |
| Active Project Tab | Wood (walnut) raised panel | Level 3 | `--spacing-wood-md` (16px) | Active tab: 12px/600 | Min-width: 80px |
| Main Content Area | Paper (cream) | Level 1 | `--spacing-paper-lg` (24px) | Body: 14px/400 | Fluid, min 320px |
| Task Cards | Paper (cream) + fiber | Level 2 | `--spacing-paper-md` (16px) | Title: 14px/600, Body: 13px/400 | Stack vertically < 640px |
| Primary Action Button | Wood (walnut) | Level 2→3 hover | `--spacing-wood-md` (16px) | Label: 14px/600 | Full-width < 480px |
| Secondary Buttons | Metal (steel) | Level 2 | `--spacing-metal-sm` (8px) | Label: 13px/500 | Min touch target 44px |

#### Kanban Board View

| Layout Zone | Material Surface | Elevation | Spacing Scale | Typography Role | Responsive Behavior |
|---|---|---|---|---|---|
| Board Background | Fabric (canvas) | Level 0 | — | — | Full bleed |
| Column Header | Wood (mahogany) panel | Level 3 | `--spacing-wood-md` (16px) | Header: 16px/700 carved | Fixed at top on scroll |
| Column Body | Fabric (linen) subtle | Level 0 | `--spacing-fabric-md` (16px) | — | Min-width: 280px; horizontal scroll |
| Task Card (in column) | Paper (cream) | Level 2 | `--spacing-paper-sm` (12px) | Title: 13px/600 | Draggable; 44px min drag handle |
| Drag Ghost | Paper (cream) + lift | Level 4 | — | — | Semi-transparent (80%) |
| Drop Zone Indicator | Paper highlight glow | Level 1 | — | — | Full column width |
| Column Actions | Metal (platinum) micro-btns | Level 2 | `--spacing-metal-xs` (4px) | Icon only, 20px | Visible on column hover |

#### Modal / Dialog Screens

| Layout Zone | Material Surface | Elevation | Spacing Scale | Typography Role | Responsive Behavior |
|---|---|---|---|---|---|
| Backdrop Overlay | Fabric (75% opacity) | Level 0 | — | — | Full viewport |
| Modal Container | Glass (clear, blur 12px) | Level 6 | `--spacing-glass-lg` (24px) | — | Max-width: 640px; centered |
| Modal Content Area | Paper (cream) | Level 8 | `--spacing-paper-lg` (24px) | Title: 18px/700, Body: 14px/400 | Scrollable if overflow |
| Confirm Button | Wood (walnut) | Level 2 | `--spacing-wood-md` (16px) | Label: 14px/600 | Right-aligned; full-width < 480px |
| Cancel Button | Metal (steel) | Level 2 | `--spacing-metal-md` (16px) | Label: 14px/500 | Left of confirm |

#### Settings / Configuration View

| Layout Zone | Material Surface | Elevation | Spacing Scale | Typography Role | Responsive Behavior |
|---|---|---|---|---|---|
| Settings Container | Paper (white) | Level 1 | `--spacing-paper-lg` (24px) | — | Max-width: 800px centered |
| Section Headers | Paper (cream) + metal border-bottom | Level 1 | `--spacing-paper-md` (16px) | Heading: 16px/700 | — |
| Form Controls (inputs) | Metal frame + Paper content | Level 0 (inset) | `--spacing-metal-sm` (8px) | Input: 14px/400 | Full-width |
| Toggle Switches | Metal (steel) track + Wood (oak) knob | Level 2 | — | Label: 13px/500 | 44px min touch target |
| Save Button | Wood (walnut) | Level 2 | `--spacing-wood-md` (16px) | Label: 14px/600 | Sticky bottom < 640px |
| Theme Selector | Metal (platinum) grid | Level 2 | `--spacing-metal-md` (16px) | Theme name: 12px/500 | 2-col < 480px, 4-col desktop |

#### Chat / Agent View

| Layout Zone | Material Surface | Elevation | Spacing Scale | Typography Role | Responsive Behavior |
|---|---|---|---|---|---|
| Chat Container | Paper (white) | Level 1 | `--spacing-paper-md` (16px) | — | Full height, flex column |
| User Messages | Paper (cream) card | Level 2 | `--spacing-paper-sm` (12px) | Message: 14px/400 | Max-width: 80% right-aligned |
| Agent Messages | Paper (aged) card | Level 2 | `--spacing-paper-sm` (12px) | Message: 14px/400 | Max-width: 80% left-aligned |
| Composer Input | Metal frame + Paper content | Level 0 (inset) | `--spacing-paper-md` (16px) | Input: 14px/400 | Sticky bottom; auto-resize |
| Send Button | Wood (walnut) | Level 2 | `--spacing-wood-sm` (8px) | Icon only | 44px square min |

#### Terminal / Console View

| Layout Zone | Material Surface | Elevation | Spacing Scale | Typography Role | Responsive Behavior |
|---|---|---|---|---|---|
| Terminal Container | Metal (dark steel) | Level 1 | `--spacing-metal-md` (16px) | — | Full height, flex column |
| Terminal Output | Paper (aged/dark) | Level 0 (inset) | `--spacing-paper-sm` (8px) | Monospace: 13px/400 | Scrollable; preserve whitespace |
| Command Input | Metal frame + Paper content | Level 0 (inset) | `--spacing-metal-sm` (8px) | Monospace: 13px/400 | Sticky bottom; single-line |
| Tab Bar (terminal tabs) | Metal (platinum) | Level 2 | `--spacing-metal-xs` (4px) | Tab label: 11px/500 | Horizontal scroll if overflow |
| Toolbar (clear, copy, etc.) | Metal (steel) micro-btns | Level 2 | `--spacing-metal-xs` (4px) | Icon only | Visible on hover or focus |

#### File Explorer View

| Layout Zone | Material Surface | Elevation | Spacing Scale | Typography Role | Responsive Behavior |
|---|---|---|---|---|---|
| Explorer Container | Paper (white) | Level 1 | `--spacing-paper-md` (16px) | — | Resizable panel (200-400px) |
| Tree Item (file) | Paper (cream) | Level 1 | `--spacing-paper-sm` (8px) indent per depth | Filename: 13px/400 | Truncate with tooltip |
| Tree Item (folder) | Paper + Metal expand icon | Level 1 | `--spacing-paper-sm` (8px) | Folder: 13px/600 | Collapsible; persist state |
| Active File Indicator | Wood (walnut) accent left border | Level 2 | — | Active: 13px/600 | 3px left border |
| Toolbar (new file, refresh) | Metal (platinum) | Level 2 | `--spacing-metal-xs` (4px) | Icon only | Sticky top |

#### Search / Command Palette View

| Layout Zone | Material Surface | Elevation | Spacing Scale | Typography Role | Responsive Behavior |
|---|---|---|---|---|---|
| Search Overlay | Glass (clear, blur 12px) | Level 8 | `--spacing-glass-lg` (24px) | — | Centered; max-width: 600px |
| Search Input | Metal frame + Paper content | Level 0 (inset) | `--spacing-metal-md` (16px) | Input: 16px/400 | Full-width within overlay |
| Results List | Paper (cream) | Level 2 | `--spacing-paper-sm` (8px) | Result: 14px/400, Path: 12px/300 | Max-height: 400px, scrollable |
| Result Item (hover) | Paper (cream) + highlight | Level 2 | `--spacing-paper-sm` (8px) | — | Full-width highlight |
| No Results State | Paper (aged) | Level 1 | `--spacing-paper-md` (16px) | Message: 14px/400 italic | Centered text |

#### Insights / Analytics View

| Layout Zone | Material Surface | Elevation | Spacing Scale | Typography Role | Responsive Behavior |
|---|---|---|---|---|---|
| Insights Container | Paper (white) | Level 1 | `--spacing-paper-lg` (24px) | — | Max-width: 1200px centered |
| Stat Cards | Paper (cream) + Metal accent | Level 2 | `--spacing-paper-md` (16px) | Value: 24px/700, Label: 12px/500 | 2-col < 768px, 4-col desktop |
| Chart Area | Paper (white) | Level 2 | `--spacing-paper-lg` (24px) | Axis: 11px/400, Title: 14px/600 | Responsive SVG |
| Filter Bar | Metal (platinum) | Level 2 | `--spacing-metal-sm` (8px) | Label: 12px/500 | Horizontal scroll < 640px |

### 1C. Canonical User Flows — End-to-End Interaction Specifications

> **⚠️ MANDATORY IMPLEMENTATION CONTRACT** — 6 core user flows defined below with step-level interaction expectations.
>
> **Format**: Each flow specifies the complete cycle: **User Intent → Trigger Action → UI State Transitions → System Feedback → Error Handling → Recovery/Undo Path**. These are the authoritative interaction contracts for implementation. No flow may ship without conforming to its specification.

Each flow defines: entry point, numbered step-level interactions (user action + UI response + material behavior), expected feedback states, error handling, and recovery/undo behavior.

**Flow Index** — Every core user task has a numbered flow below with step-level interaction expectations:

| Flow | Core Task | Trigger | Key Screens | Success Criterion | Error Recovery |
|------|-----------|---------|-------------|-------------------|----------------|
| **Flow 1** | Create a New Task | Click "New Task" / `Cmd+N` | Kanban, Wizard Modal | Task in kanban < 500ms | Per-field inline + retry |
| **Flow 2** | Switch Projects | Click tab / `Cmd+1-9` | Tab Bar, Content Area | Tab switch < 300ms | Error badge + retry card |
| **Flow 3** | Edit Task | Click task card / `Cmd+E` | Task Dialog, Kanban | 10s undo after save | Inline errors + retry |
| **Flow 4** | Delete / Archive Task | "⋯" menu → Delete/Archive | Kanban, Confirm Dialog, Toast | 10s undo via toast | Error banner + retry |
| **Flow 5** | Recover from Error | System error occurs | Error Boundaries, Toast | Recovery CTA always visible | Retry / Go Back / Report |
| **Flow 6** | Configure Settings | Sidebar → Settings / `Cmd+,` | Settings View, Theme Selector | Theme switch < 300ms | Per-field inline + revert |

#### Flow 1: Create a New Task

| Step | User Action | UI Response | Feedback State | Material Behavior |
|---|---|---|---|---|
| 1 | Click "New Task" button (wood) | Button depresses 2px; wizard modal opens | Loading → Content | Wood compress → Glass modal slides in |
| 2 | Fill task title (metal frame input) | Metal frame highlights on focus; paper content area accepts text | Idle → Focus | Metal glow ring; paper brightens |
| 3 | Select priority (metal dropdown) | Glass overlay opens with paper list items | Idle → Open | Glass fade-in; paper items hover-highlight |
| 4 | Click "Create" (wood confirm button) | Button depresses; modal closes; toast appears | Loading → Success | Wood compress → Glass dissolves → Paper toast slides in |
| **Error** | Validation fails | Metal frame turns error-warm; error text appears below input | Error | Metal frame glows red; paper error message fades in |
| **Recovery** | Fix field and resubmit | Error clears on valid input; success toast on submit | Error → Success | Metal frame returns to neutral; paper toast confirms |

**Intent → Feedback Contract**:
- **User Intent**: "I want to create a new task and assign it to a project."
- **Trigger**: Click wood "New Task" button (keyboard: `Cmd+N`)
- **State Transitions**: `Idle → Button Press (50ms) → Modal Open (200ms glass slide) → Form Idle → [user fills] → Submit Loading (spinner in wood button) → Success (modal close + toast) | Error (inline per-field)`
- **Success Feedback**: Modal closes (glass dissolve 200ms); paper toast "Task created" slides in (auto-dismiss 5s); new task card appears in kanban column within 500ms
- **Error Feedback**: Per-field metal frame error glow + inline message below field; summary banner "N fields need attention" at form top; first error field receives focus
- **Recovery Path**: Fix invalid field → error clears on valid blur → resubmit; or press Escape/Cancel to abandon (no data loss warning if no fields touched)
- **Undo**: N/A (task creation is not undoable; user can delete task after creation)

**Acceptance Criteria**: Task appears in kanban within 500ms of creation. Toast auto-dismisses after 5s. Error messages are actionable ("Title is required" not "Validation error").

#### Flow 2: Switch Projects via Tab Bar

| Step | User Action | UI Response | Feedback State | Material Behavior |
|---|---|---|---|---|
| 1 | Click inactive project tab (metal) | Tab elevates to wood active state; content area transitions | Loading → Content | Metal → Wood material morph; paper content cross-fades |
| 2 | Use Cmd+Tab shortcut | Same as click; active tab indicator moves | Loading → Content | Instant tab highlight transition (150ms) |
| 3 | Drag tab to reorder | Tab lifts to Level 4; drop zone highlights | Dragging | Metal tab lifts; fabric drop zone glows |
| **Error** | Project fails to load | Tab shows error badge (metal red); content shows error card | Error | Metal tab gets error accent; paper error card with retry CTA |
| **Recovery** | Click "Retry" on error card | Content reloads; error clears on success | Error → Loading → Content | Paper error fades; loading shimmer; content fades in |

**Intent → Feedback Contract**:
- **User Intent**: "I want to switch to a different project to view its tasks."
- **Trigger**: Click inactive metal tab (keyboard: `Cmd+1-9` or `Cmd+Tab`)
- **State Transitions**: `Idle → Tab Press (metal depress 1px, 50ms) → Content Loading (paper shimmer in content area) → Content Loaded (paper cross-fade 200ms) | Error (error badge on tab + error card in content)`
- **Success Feedback**: Active tab morphs metal→wood (200ms); content area cross-fades to new project; project name announced via `aria-live`
- **Error Feedback**: Metal tab gets red error badge (8px dot); content area shows paper error card with cause + wood "Retry" CTA
- **Recovery Path**: Click "Retry" on error card → content reloads; or click a different tab to navigate away
- **Undo**: N/A (navigation is non-destructive)

**Acceptance Criteria**: Tab switch completes in < 300ms. Drag reorder persists across sessions. Error state always shows a retry action.

#### Flow 3: Edit Task in Dialog

| Step | User Action | UI Response | Feedback State | Material Behavior |
|---|---|---|---|---|
| 1 | Click task card (paper) | Card lifts to Level 3; edit dialog opens | Idle → Open | Paper lift → Glass modal → Paper content |
| 2 | Modify fields | Metal frame inputs accept edits; unsaved indicator appears | Editing | Metal focus glow; wood "unsaved" dot badge |
| 3 | Click "Save" (wood button) | Button depresses; dialog closes; card updates | Loading → Success | Wood compress; glass dissolves; paper card updates |
| **Error** | Save fails (network/server) | Error banner in modal with retry; fields preserved | Error | Paper error banner; wood retry button |
| **Recovery** | Click "Retry" or fix and re-save | Error clears; save retries | Error → Loading → Success | Transition back through normal save flow |

**Intent → Feedback Contract**:
- **User Intent**: "I want to update an existing task's details."
- **Trigger**: Click task card on kanban (keyboard: `Cmd+E` on selected task)
- **State Transitions**: `Idle → Card Lift (paper elevation 2→3, 150ms) → Dialog Open (glass slide 200ms) → Form Idle → [user edits] → Unsaved State (wood dot badge) → Save Loading (spinner in wood button) → Success (dialog close + card update) | Error (inline banner + retry)`
- **Success Feedback**: Dialog closes (glass dissolve 200ms); task card in kanban updates in-place; paper toast "Task updated" (auto-dismiss 5s); focus returns to the card that was edited
- **Error Feedback**: Paper error banner inside modal with cause text + wood "Retry" button; all field values preserved; modal stays open
- **Recovery Path**: Click "Retry" to re-attempt save; or fix field and re-save; or click Cancel (prompted "Discard unsaved changes?")
- **Undo**: "Undo" link in success toast for 10s after save; clicking undo reverts task to pre-edit state

**Acceptance Criteria**: Unsaved changes prompt on close attempt. All field values preserved on error. Undo available for 10s after save.

#### Flow 4: Delete / Archive Task

| Step | User Action | UI Response | Feedback State | Material Behavior |
|---|---|---|---|---|
| 1 | Open task card "⋯" menu (metal dropdown) | Metal dropdown appears with action list | Idle → Menu Open | Glass overlay with paper menu items |
| 2 | Click "Delete" or "Archive" | Confirmation dialog opens | Confirming | Glass modal slides in with paper content; destructive action highlighted |
| 3a (Delete) | Click "Delete" (destructive) | Card shrinks and fades; toast with "Undo" appears | Success (destructive) | Paper card crumple animation (300ms); paper toast with wood "Undo" CTA |
| 3b (Archive) | Click "Archive" | Card slides out to right; toast with "Undo" appears | Success | Paper card slide-out (250ms); paper toast with wood "Undo" CTA |
| **Error** | Delete/archive fails (server) | Confirmation dialog shows error banner; card preserved | Error | Paper error banner in dialog; card remains in kanban |
| **Recovery** | Click "Retry" in error banner | Action retries; success or repeated error | Error → Loading → Success | Wood "Retry" depresses; loading shimmer |

**Intent → Feedback Contract**:
- **User Intent**: "I want to remove or archive a task I no longer need."
- **Trigger**: Task card "⋯" menu → "Delete" or "Archive" (keyboard: `Backspace` or `Cmd+Backspace` on selected task)
- **State Transitions**: `Idle → Menu Open (glass 150ms) → Confirmation Dialog (glass 200ms) → User Confirms → Delete/Archive Processing (100ms) → Success (card removed + toast) | Error (dialog error banner)`
- **Success Feedback**: Card removed from kanban with animation; paper toast "Task deleted" / "Task archived" with wood "Undo" CTA (10s window); column count badge updates immediately
- **Error Feedback**: Paper error banner inside confirmation dialog: "Failed to delete — [cause]" + wood "Retry" CTA; card remains visible and unmodified in kanban
- **Recovery Path**: Click "Retry" in error banner; or click "Cancel" to dismiss dialog (task preserved); after successful delete, "Undo" in toast (10s) restores the task
- **Undo**: Wood "Undo" CTA in success toast for 10s; clicking restores task to its original kanban position; toast confirms "Task restored"

**Acceptance Criteria**: Destructive actions always require confirmation dialog. Undo available for 10s. Deleted task disappears from kanban within 200ms of confirmation. Archive/delete accessible only via secondary "⋯" menu (never as primary surface button per §1E density rules).

#### Flow 5: Recover from Error State

| Step | User Action | UI Response | Feedback State | Material Behavior |
|---|---|---|---|---|
| 1 | Error occurs (any operation) | Contextual error card/banner with explanation + CTA | Error | Paper error surface with metal accent border |
| 2 | Read error message | Message explains what happened and what to do | — | High-contrast text on paper surface |
| 3 | Click recovery action ("Retry" / "Go Back" / "Report") | Action executes; loading state shown | Loading | Wood CTA depresses; loading shimmer on paper |
| 4 | Operation succeeds | Success feedback; error clears | Success | Paper success toast; normal state restores |

**Acceptance Criteria**: Every error shows: (1) what happened, (2) why, (3) what user can do. No dead-end error states. Recovery action always visible. Error cards must have ≥ 7:1 contrast on all themes (AAA).

**Intent → Feedback Contract**:
- **User Intent**: "Something went wrong — I need to understand what happened and fix it."
- **Trigger**: System error occurs (network failure, validation error, server error, timeout)
- **State Transitions**: `Normal Operation → Error Detected → Error Card/Banner Rendered (immediate, <100ms) → User Reads → Recovery Action → Loading → Success | Repeated Error`
- **Success Feedback**: Error card fades out (200ms); normal state restores; optional paper toast "Operation completed" if original action succeeds on retry
- **Error Feedback**: Contextual paper error card with metal accent border; headline states what happened; body states why; CTA states what to do (wood "Retry" / metal "Go Back" / metal "Report Issue")
- **Recovery Path**: Always at least one CTA visible; "Retry" re-attempts the failed operation; "Go Back" navigates to safe state; "Report Issue" opens support flow. No dead-end screens.
- **Undo**: N/A (error recovery is forward-only)

#### Flow 6: Configure Settings & Switch Themes

| Step | User Action | UI Response | Feedback State | Material Behavior |
|---|---|---|---|---|
| 1 | Open Settings from sidebar (metal) | Sidebar item highlights; settings panel slides in | Loading → Content | Metal sidebar glow; paper settings content fades in |
| 2 | Modify a text setting (metal frame input) | Metal frame highlights on focus; paper content area accepts input | Idle → Focus → Editing | Metal glow ring; unsaved dot appears |
| 3 | Toggle a switch (metal+wood) | Switch thumb moves; state updates immediately | Idle → Active | Wood thumb slides on metal track |
| 4 | Switch theme in theme selector | Theme transition (300ms); all materials adapt colors | Transitioning → Idle | Smooth cross-fade of all material colors; no FOUC |
| 5 | Click "Save" (wood button) | Button depresses; toast confirms save | Loading → Success | Wood compress → Paper toast slides in |
| **Error** | Save fails (validation/server) | Inline error below failed field; save button re-enables | Error | Metal frame error glow; paper error text |
| **Recovery** | Fix field and re-save | Error clears on valid blur; success toast on save | Error → Success | Metal frame returns neutral; paper toast confirms |

**Acceptance Criteria**: Settings persist across sessions. Theme switch completes in < 300ms. Unsaved changes prompt on navigation away. All toggle changes take effect immediately (no save required for toggles).

**Intent → Feedback Contract**:
- **User Intent**: "I want to change my preferences and/or switch the visual theme."
- **Trigger**: Click Settings in sidebar (keyboard: `Cmd+,`)
- **State Transitions**: `Idle → Sidebar Highlight (metal glow, 100ms) → Settings Panel Load (paper fade-in 200ms) → Form Idle → [user edits] → Unsaved State → Save Loading → Success | Error`
- **Success Feedback**: Wood "Save" button depresses; paper toast "Settings saved" (auto-dismiss 5s); for theme switch: all material colors cross-fade (300ms, no FOUC)
- **Error Feedback**: Per-field metal frame error glow + inline error text below field; save button re-enables
- **Recovery Path**: Fix invalid field (error clears on valid blur) → re-save; or Cancel/navigate away (prompted "Discard unsaved changes?")
- **Undo**: Cancel button reverts all unsaved changes; toggled switches revert if Cancel pressed before Save

#### Flow Summary — UX Acceptance Criteria Matrix

| Flow | Max Latency | Error Recovery | Undo/Revert | Keyboard Shortcut | A11y Requirement |
|------|------------|----------------|-------------|-------------------|-----------------|
| 1 — Create Task | 500ms to kanban appear | Per-field inline + retry | — | Cmd+N opens wizard | Focus trapped in wizard |
| 2 — Switch Project | 300ms tab switch | Error badge + retry card | — | Cmd+1-9, Cmd+Tab | Announce project name |
| 3 — Edit Task | 200ms dialog open | Inline errors + retry | 10s undo after save | Cmd+E on selected task | Focus returns to card |
| 4 — Delete/Archive Task | 200ms card removal | Error banner in dialog + retry | 10s undo via toast | Backspace on selected | Announce "task deleted/archived" |
| 5 — Error Recovery | Immediate error display | Always: cause + action | Retry always available | — | Error announced via aria-live |
| 6 — Configure Settings | 300ms theme transition | Per-field inline | Revert on cancel | Cmd+, opens settings | Toggle changes announced |

### 1D. Component State Matrix — Idle / Loading / Empty / Error / Success

> **Rule**: Every major view and interactive component MUST define UX behavior for all five states. Inline validation and actionable error messaging are mandatory. No component may ship with an undefined state.

| View / Component | Idle | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| **KanbanBoard** | Columns displayed with task cards on paper surfaces | Paper skeleton cards with `paper-read` shimmer animation; column headers static | Paper card: "No tasks yet — create one to get started" + wood "Create Task" CTA | Paper error card: "Failed to load tasks" + cause text + wood "Retry" CTA | Normal idle; success toast on bulk operations (auto-dismiss 5s) |
| **TaskCard** | Paper card at elevation-2 with title, status badge, priority | Skeleton shimmer matching card dimensions (200×120px) | N/A (card not rendered if no task) | Red metal accent border-left (3px); "Error loading — [Retry]" link | Brief green metal accent flash (300ms) on save |
| **Sidebar Navigation** | Metal panel with icon items; wood highlight on active | Metal items with subtle pulse on active load (1s cycle) | N/A (sidebar always has items) | Error badge (metal red dot, 8px) on failed item; tooltip explains error | Wood highlight on successful navigation (200ms) |
| **Chat / Agent View** | Paper message cards in scroll area | Typing indicator: 3 wood dots with bounce animation (600ms loop) | Paper card: "Start a conversation" + wood "Send a message" CTA | Paper error message card: "Message failed — [Resend]" wood button | Message appears with paper slide-in animation (250ms) |
| **Settings Form** | Metal frame inputs with paper content | Wood save button shows inline spinner; fields readonly during save | N/A (form always has fields) | Metal frame turns error-warm (#E24A4A glow); inline text below field: specific message (e.g., "API key must be 32+ characters") | Success toast (paper): "Settings saved" auto-dismiss 5s |
| **Task Creation Wizard** | Glass modal with paper form steps | Wood "Create" button: inline spinner; fields disabled | N/A (wizard is always populated by user) | Per-field: metal frame error glow + inline message below + summary count at top: "2 fields need attention" | Modal closes; success toast; card appears in kanban within 500ms |
| **Project Tab Bar** | Metal tabs with wood active state | Loading tab: metal with subtle shimmer (1.5s cycle) | Single "Default Project" tab always present | Error badge on tab (metal red dot); content area shows paper error card with wood "Retry" + explanation | Tab activates with wood material transition (200ms) |
| **File Explorer** | Paper tree with metal expand icons | Skeleton tree lines (3-4) with paper shimmer | Paper card: "No files found — this project has no files yet" | Paper error: "Failed to load files" + cause + wood "Retry" | File opens; tree item gets wood active highlight (left border) |
| **Search / Combobox** | Metal frame input, glass dropdown hidden | Glass dropdown: paper shimmer items (3 rows) | Glass dropdown: "No results found" (paper text) + suggestion: "Try different keywords" | Glass dropdown: "Search failed — try again" (paper text) + metal "Retry" link | Item highlighted with wood accent on select; dropdown closes |
| **Terminal** | Metal container with paper output area | Cursor blink animation on paper surface | Paper: "Terminal ready" with blinking cursor | Paper error line: red-tinted text with metal accent | Command output appears immediately on paper surface |
| **Progress / Phase Indicator** | Metal track with wood fill at current % | Wood fill animates to target % (300ms) | Metal track at 0% fill | Metal track with red error accent; "Phase failed — [View Details]" | Wood fill reaches 100%; brief wood shine animation (500ms) |

**Copy Tone Rules**:
- **Loading**: No text; visual shimmer only (avoids "Loading..." fatigue)
- **Empty**: Friendly, actionable ("No tasks yet — create one to get started")
- **Error**: Specific cause + action ("Network error loading tasks. [Retry]" — never generic "Something went wrong")
- **Success**: Brief confirmation, auto-dismiss 5s ("Task created" / "Settings saved")

**Inline Validation Pattern**: All form fields MUST validate on blur and show error immediately below the field. Error message MUST state what's wrong and how to fix it (e.g., "Title must be at least 3 characters" not "Invalid input").

**Required Error Anatomy** (for every error state in the matrix above):
```
┌─────────────────────────────────────┐
│ [!] Error headline (what happened)  │  ← Paper surface, metal accent border
│                                     │
│ Cause: Why this happened.           │  ← 13px/400, muted text
│                                     │
│ [↻ Retry]  [→ Go Back]             │  ← Wood CTA + Metal secondary
└─────────────────────────────────────┘
```

**Required Empty State Anatomy**:
```
┌─────────────────────────────────────┐
│       [illustration/icon]           │  ← Metal-etched icon, 48px
│                                     │
│   Friendly headline.                │  ← 16px/600, paper text
│   Brief explanation of what to do.  │  ← 13px/400, muted
│                                     │
│        [+ Create One]               │  ← Wood primary CTA
└─────────────────────────────────────┘
```

**Required Loading State Rules**:
- Paper surfaces: Skeleton shimmer (sepia-tinted gradient sweep, 2.5s cycle)
- Metal surfaces: Subtle pulse (brightness oscillation, 1.5s cycle)
- Wood surfaces: Shine sweep (highlight gradient sweep, 2s cycle)
- Duration threshold: If loading > 3s, show "Still loading…" text below shimmer
- Never block the entire screen; load incrementally per region

**Inline Validation Standard** (mandatory for all form fields):

| Trigger | Behavior | Visual Treatment |
|---------|----------|-----------------|
| Blur with invalid value | Show error below field immediately | Metal frame: `box-shadow: inset 0 0 0 2px var(--material-error-glow)` + paper error text below (13px, `color: var(--error-text)`) |
| Keystroke after error shown | Re-validate on each keystroke; clear error when valid | Metal frame transitions back to neutral (200ms); error text fades out |
| Submit with errors | Scroll to first error field; show summary count at top | "2 fields need attention" paper banner at form top with metal accent; first error field receives focus |
| Server-side error on submit | Map server field errors to specific inputs | Same per-field treatment; if field unknown, show banner-level error |

### 1E. Interaction Density & Progressive Disclosure Rules

> **Principle**: Complex screens (kanban, multi-control panels, settings) MUST manage cognitive load through staged reveal patterns. Users should never see more than they need at any given moment.
>
> **Token Integration**: All timing values in this section reference `design-system/tokens/motion.css`. All spacing values reference `design-system/tokens/spacing.css`. Elevation values reference `design-system/tokens/elevation.css`.

**Interaction Density Ceiling** (hard limit per viewport):
- **Maximum simultaneously visible wood (primary) CTAs**: 2 per viewport
- **Maximum simultaneously visible metal controls**: 8 per viewport region (toolbar/panel)
- **Maximum paper cards visible without scrolling**: 12 (kanban), 8 (list view), 6 (grid)
- **Maximum open glass overlays**: 1 (modals are mutually exclusive; nested modals forbidden)

**Maximum Visible Primary Actions Per Region** (hard limits):

| Region | Wood (Primary) | Metal (Secondary) | Total Visible Controls | Overflow Strategy |
|--------|---------------|-------------------|----------------------|-------------------|
| Header/Toolbar | 1 max | 3 max | 4 | Metal "more" dropdown |
| Card surface | 1 max | 2 max (on hover only) | 3 | Metal "⋯" dropdown |
| Modal footer | 1 confirm | 1 cancel | 2 | Additional actions in metal dropdown at top-right |
| Sidebar section | — | 1 active item highlighted | Varies | Collapsed groups by default; expand on click |
| Kanban column header | — | 2 (add + filter) | 2 | "⋯" dropdown for bulk ops |

**Progressive Disclosure Patterns**:

| Screen | Default State | Expanded State | Trigger |
|--------|--------------|----------------|---------|
| Kanban columns | Only column name + count badge visible in header | Advanced filters, sort options, bulk actions revealed | Metal toggle chevron in column header |
| Task cards | Title + status badge + priority only | Description preview, assignee, due date, action buttons | Click card → detail panel; hover → show action row |
| Settings panels | Grouped into collapsible paper sections; only first section expanded | All fields in section visible | Metal chevron toggle per section |
| Form wizards | One step at a time; progress indicator shows total steps | Only current step fields visible | Metal rail progress indicator; "Next" wood button advances |
| Search results | Top 5 results shown | Full result list with categories | "Show all N results" metal link at bottom |

**When to Use Secondary Menus vs Inline Controls** (decision matrix):

| Condition | Use Inline Control (metal) | Use Secondary Menu (metal "⋯" dropdown) |
|-----------|---------------------------|------------------------------------------|
| Action frequency > 5×/session per user | ✅ Always visible | — |
| Action frequency 1-5×/session | — | ✅ Grouped in dropdown |
| Action frequency < 1×/session | — | ✅ Buried in dropdown, labeled clearly |
| Destructive action (delete, reset) | ❌ Never inline as primary | ✅ Always in dropdown + confirmation dialog |
| Context-dependent action (only valid in specific state) | — | ✅ Shown only when state applies |
| Action requires > 1 click to complete | ❌ Never inline | ✅ Opens sub-panel or dialog |
| Space-constrained region (< 200px width) | ❌ Icon-only max 2 | ✅ Everything else |

**Staged Reveal Timing** (using motion tokens):
- **Hover reveal delay**: 150ms (`var(--timing-response-metal)`) before showing hover controls on cards
- **Expand/collapse animation**: 200ms (`var(--timing-entry-metal)`) for section expansion
- **Dropdown open**: 150ms (`var(--timing-entry-glass)`) for glass overlay appearance
- **Tooltip delay**: 500ms before showing, matching system tooltip convention

**Control Visibility Rules** (mandatory):

| Rule | Enforcement |
|------|-------------|
| Destructive actions (delete, reset, revoke) NEVER appear as primary surface buttons | Always in secondary metal "⋯" dropdown; require confirmation dialog |
| Bulk operations appear ONLY when ≥2 items selected | Metal toolbar slides in from top with count badge: "3 selected — [Delete] [Move] [Archive]" |
| Advanced options hidden behind collapsible | Metal "Advanced" chevron toggle; collapsed by default; persist expand state in localStorage |
| Keyboard shortcuts shown in tooltips, NOT on primary surface | Material tooltip (glass) on hover after 500ms delay; format: "⌘N" |
| Inline editing requires explicit activation | Click text to enter edit mode; show metal "✓ Save" / "✗ Cancel" controls inline |

## 2. Target Skeuomorphic Design Direction & Design System Blueprint

### 2.1 Reusable Design Token System

This section defines the comprehensive token system that will be used consistently across all components and themes to ensure authentic material representation and reusable design patterns.

#### 2.1.1 Design Token Hierarchy Structure

**Tier 1: Global Foundation Tokens**

> **⚠️ AUDIT CORRECTION**: The token names below have been corrected to match the actual CSS custom properties in `design-system/tokens/materials.css`. An earlier draft used phantom names (`cherry`, `aluminum`, `dark-steel`) that do not exist in the codebase. The canonical names are: metal = `platinum | steel | titanium`; wood = `walnut | mahogany | oak`. The `-base` suffix shown below is a semantic convention for this plan's Tier 1 definitions — the actual CSS tokens omit `-base` (e.g., `--material-wood-walnut: #8B4513`).

```css
/* Base Material Colors (Immutable — canonical names from materials.css) */
--material-wood-walnut: #8B4513;
--material-wood-mahogany: #A0522D;
--material-wood-oak: #654321;
--material-metal-platinum: #E8E8E8;
--material-metal-steel: #D4D4D4;
--material-metal-titanium: #4A4A4A;
--material-paper-cream: #FEFCF8;  /* Note: actual token is --material-paper-cream, not -base */
--material-paper-white: #FEFCF8;
--material-paper-aged: #F5F2EA;
--material-glass-clear: rgba(255,255,255,0.85);
--material-glass-tinted: rgba(248,248,248,0.80);
--material-fabric-linen: #F7F5F3;
--material-fabric-canvas: #F2F0ED;

/* Elevation Shadow System */
--elevation-0: inset 1px 1px 2px rgba(0,0,0,0.1);
--elevation-1: none;
--elevation-2: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
--elevation-3: 0 3px 6px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.12);
--elevation-4: 0 6px 12px rgba(0,0,0,0.15), 0 4px 8px rgba(0,0,0,0.12);
--elevation-6: 0 12px 28px rgba(0,0,0,0.15), 0 8px 16px rgba(0,0,0,0.12);
--elevation-8: 0 16px 36px rgba(0,0,0,0.18), 0 12px 24px rgba(0,0,0,0.15);

/* Material Physics Properties */
--physics-wood-compress: 2px;
--physics-metal-compress: 1px;
--physics-paper-compress: 0.5px;
--physics-glass-compress: 0px;
--physics-fabric-compress: 3px;

/* Interaction Timing Functions */
--timing-wood-interaction: cubic-bezier(0.4, 0.0, 0.2, 1);
--timing-metal-interaction: cubic-bezier(0.25, 0.46, 0.45, 0.94);
--timing-paper-interaction: cubic-bezier(0.25, 0.46, 0.45, 0.94);
--timing-glass-interaction: cubic-bezier(0.4, 0.0, 0.6, 1);
--timing-fabric-interaction: cubic-bezier(0.23, 1, 0.320, 1);
```

**Tier 2: Semantic Material Tokens**
```css
/* Component Material Assignments */
--material-button-primary: var(--material-wood-walnut);
--material-button-secondary: var(--material-metal-steel);
--material-surface-content: var(--material-paper-cream);
--material-surface-overlay: var(--material-glass-clear);
--material-surface-background: var(--material-fabric-linen);
--material-control-frame: var(--material-metal-platinum);
--material-navigation-panel: var(--material-metal-steel);

/* State Modifiers */
--material-hover-brightness: 1.1;
--material-active-brightness: 0.9;
--material-disabled-saturation: 0.5;
--material-focus-glow-intensity: 0.6;

/* Interactive Feedback Modifiers */
--feedback-hover-shadow-multiplier: 1.15;
--feedback-active-shadow-reduction: 0.6;
--feedback-focus-glow-size: 3px;
```

**Tier 3: Component-Specific Tokens**
```css
/* Button System Tokens */
--button-wood-grain-opacity: 0.15;
--button-metal-brush-intensity: 0.08;
--button-corner-radius: 8px;
--button-text-shadow: 0 1px 1px rgba(0,0,0,0.3);
--button-press-duration: 200ms;
--button-recovery-timing: var(--timing-wood-interaction);

/* Card System Tokens */
--card-paper-fiber-opacity: 0.05;
--card-corner-radius: 12px;
--card-content-padding: 24px;
--card-hover-lift-distance: 2px;
--card-shadow-base: var(--elevation-2);
--card-shadow-hover: var(--elevation-3);

/* Input System Tokens */
--input-metal-frame-width: 2px;
--input-paper-content-padding: 12px 16px;
--input-focus-glow-color: #4A90E2;
--input-error-glow-color: #E24A4A;
--input-corner-radius: 6px;
```

#### 2.1.2 Texture Pattern Token System

**Reusable Material Texture Definitions**
```css
/* Wood Grain Patterns (Reusable across components) */
--texture-wood-grain-walnut:
  linear-gradient(45deg, transparent 25%, rgba(0,0,0,0.05) 26%, rgba(0,0,0,0.05) 27%, transparent 27%, transparent 74%, rgba(0,0,0,0.05) 75%, rgba(0,0,0,0.05) 76%, transparent 77%),
  linear-gradient(47deg, transparent 40%, rgba(0,0,0,0.02) 41%, transparent 42%);

--texture-wood-grain-mahogany:
  linear-gradient(42deg, transparent 30%, rgba(139,69,19,0.08) 31%, rgba(139,69,19,0.08) 32%, transparent 32%, transparent 68%, rgba(139,69,19,0.08) 69%, rgba(139,69,19,0.08) 70%, transparent 71%),
  linear-gradient(44deg, transparent 45%, rgba(160,82,45,0.04) 46%, transparent 47%);

/* Metal Brushed Patterns */
--texture-metal-brushed-horizontal:
  repeating-linear-gradient(90deg, transparent 0px, transparent 1px, rgba(0,0,0,0.03) 1px, rgba(0,0,0,0.03) 2px, transparent 2px, transparent 4px),
  linear-gradient(90deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.05) 100%);

--texture-metal-brushed-vertical:
  repeating-linear-gradient(0deg, transparent 0px, transparent 1px, rgba(0,0,0,0.03) 1px, rgba(0,0,0,0.03) 2px, transparent 2px, transparent 4px),
  linear-gradient(0deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.05) 100%);

/* Paper Fiber Patterns */
--texture-paper-fiber-fine:
  radial-gradient(circle at 20% 30%, rgba(0,0,0,0.02) 1px, transparent 2px),
  radial-gradient(circle at 60% 80%, rgba(0,0,0,0.015) 1px, transparent 2px),
  radial-gradient(circle at 80% 20%, rgba(0,0,0,0.01) 1px, transparent 1.5px);

--texture-paper-fiber-visible:
  radial-gradient(circle at 25% 40%, rgba(139,69,19,0.03) 1.5px, transparent 2.5px),
  radial-gradient(circle at 70% 15%, rgba(139,69,19,0.02) 1px, transparent 2px),
  radial-gradient(circle at 15% 85%, rgba(139,69,19,0.025) 1.2px, transparent 2.2px);

/* Fabric Weave Patterns */
--texture-fabric-linen-weave:
  repeating-conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(0,0,0,0.015) 45deg, transparent 90deg, rgba(0,0,0,0.015) 135deg, transparent 180deg, rgba(0,0,0,0.015) 225deg, transparent 270deg, rgba(0,0,0,0.015) 315deg, transparent 360deg);

--texture-fabric-canvas-weave:
  repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 1px, transparent 1px, transparent 3px),
  repeating-linear-gradient(90deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 1px, transparent 1px, transparent 3px);
```

#### 2.1.2a Token Non-Bypass Enforcement Rules

> **MANDATORY**: This is a non-negotiable design system rule. Violations fail CI.

**The Rule**: Components may ONLY consume semantic tokens. No raw hex, rgb, rgba, or hsl values are permitted in component-level styles. This applies to ALL style properties that accept color values: `background`, `color`, `border-color`, `box-shadow`, `outline-color`, `text-decoration-color`, `fill`, `stroke`.

**Where raw values ARE allowed**: ONLY in `design-system/tokens/*.css` files (Layer 1) where tokens are *defined*. Nowhere else in the codebase.

**Where raw values are FORBIDDEN**: Every file outside of `design-system/tokens/`:
- `components/ui/*.tsx` — component styles
- `components/**/*.tsx` — feature components
- `*.module.css` — CSS modules
- `globals.css` — (except for existing Tailwind semantic vars which map to tokens)

**Allowed in component CSS/TSX**:
```css
/* ✅ CORRECT — uses semantic token */
background: var(--material-wood-walnut-base);
color: var(--material-paper-text-color);
box-shadow: var(--elevation-2);
border-color: var(--material-metal-steel-base);
```

**Forbidden in component CSS/TSX**:
```css
/* ❌ FORBIDDEN — raw color value — BUILD WILL FAIL */
background: #8B4513;
color: rgb(254, 252, 248);
box-shadow: 0 1px 3px rgba(0,0,0,0.12);
border-color: hsl(30, 50%, 30%);
```

**Exception — Transparency modifiers**: `rgba()` is allowed ONLY when applied to a token-derived value for opacity adjustment:
```css
/* ✅ Allowed: opacity modifier on token */
background: color-mix(in srgb, var(--material-wood-walnut-base) 80%, transparent);
/* ❌ Forbidden: raw rgba */
background: rgba(139, 69, 19, 0.8);
```

**Lint Enforcement** (add to ESLint / Stylelint config):
```jsonc
// stylelint.config.js
{
  "rules": {
    "color-no-hex": true, // Disallow hex in component files
    "declaration-property-value-disallowed-list": {
      "background": ["/^#/", "/^rgb/", "/^hsl/"],
      "color": ["/^#/", "/^rgb/", "/^hsl/"],
      "border-color": ["/^#/", "/^rgb/", "/^hsl/"],
      "box-shadow": ["/^\\d/"]  // Must use var(--elevation-*)
    }
  },
  "overrides": [{
    "files": ["**/design-system/tokens/**/*.css"],
    "rules": {
      "color-no-hex": null,
      "declaration-property-value-disallowed-list": null
    }
  }]
}
```

**CI Gate**: Build MUST fail if any component file contains raw color values outside of token definition files. This is enforced via the Stylelint config above integrated into the build pipeline.

**Enforcement Chain** (3 layers, all mandatory):

| Layer | Tool | When | Failure Mode |
|-------|------|------|-------------|
| **IDE** | Stylelint + VS Code extension | On save | Yellow warning squiggle; suggests token replacement |
| **Pre-commit** | `lint-staged` + Stylelint | On `git commit` | Commit blocked; error message shows line + suggested token |
| **CI** | Stylelint in GitHub Actions / build pipeline | On PR | PR check fails; cannot merge until all raw values replaced |

**Token Lookup Reference** (for developers):
- Background colors → `var(--material-{type}-{variant}-base)` (e.g., `var(--material-wood-walnut-base)`)
- Text colors → `var(--material-{type}-text-color)` (e.g., `var(--material-paper-text-color)`)
- Border colors → `var(--material-{type}-{variant}-base)` or `var(--material-{type}-border-color)`
- Shadow values → `var(--elevation-{level})` (e.g., `var(--elevation-2)`)
- Focus glow → `var(--focus-{type}-color)` (e.g., `var(--focus-wood-color)`)
- Error/success → `var(--material-error-glow)`, `var(--material-success-glow)`

#### 2.1.3 Material Lighting Token System

**Unified Lighting Direction Tokens**
```css
/* Primary Light Source (135° Direction) */
--light-primary-angle: 135deg;
--light-primary-intensity: 0.4;
--light-ambient-intensity: 0.15;

/* Material-Specific Highlight Responses */
--highlight-wood-intensity: 0.2;
--highlight-metal-intensity: 0.4;
--highlight-paper-intensity: 0.1;
--highlight-glass-intensity: 0.8;
--highlight-fabric-intensity: 0.05;

/* Material-Specific Shadow Colors */
--shadow-wood-color: rgba(101,67,33,0.3);
--shadow-metal-color: rgba(0,0,0,0.2);
--shadow-paper-color: rgba(139,69,19,0.15);
--shadow-glass-color: rgba(0,0,0,0.1);
--shadow-fabric-color: rgba(44,44,44,0.2);

/* Interactive Lighting Modifiers */
--lighting-hover-boost: 1.2;
--lighting-active-reduction: 0.8;
--lighting-focus-intensity: 1.5;
```

### 2.1.4 Reusable Component Pattern Library

This section defines standardized component patterns that can be consistently applied across the entire application using the established material and token systems.

#### Component Base Classes (Reusable Foundation)

**Universal Material Component Base**
```css
.material-component {
  position: relative;
  transition-property: transform, box-shadow, background, border, filter;
  transition-duration: inherit;
  transition-timing-function: inherit;
  will-change: transform, box-shadow;
  transform-style: preserve-3d;
  backface-visibility: hidden;
}

/* Material Type Base Classes */
.material-wood {
  --material-base-color: var(--material-wood-walnut-base);
  --material-texture: var(--texture-wood-grain-walnut);
  --material-shadow-color: var(--shadow-wood-color);
  --material-highlight-intensity: var(--highlight-wood-intensity);
  --material-compress-distance: var(--physics-wood-compress);
  --material-timing: var(--timing-wood-interaction);

  background: var(--material-texture), var(--material-base-color);
  box-shadow: var(--elevation-2);
  transition-duration: 300ms;
  transition-timing-function: var(--material-timing);
}

.material-metal {
  --material-base-color: var(--material-metal-steel-base);
  --material-texture: var(--texture-metal-brushed-horizontal);
  --material-shadow-color: var(--shadow-metal-color);
  --material-highlight-intensity: var(--highlight-metal-intensity);
  --material-compress-distance: var(--physics-metal-compress);
  --material-timing: var(--timing-metal-interaction);

  background: var(--material-texture), var(--material-base-color);
  box-shadow: var(--elevation-2);
  transition-duration: 200ms;
  transition-timing-function: var(--material-timing);
}

.material-paper {
  --material-base-color: var(--material-paper-cream-base);
  --material-texture: var(--texture-paper-fiber-fine);
  --material-shadow-color: var(--shadow-paper-color);
  --material-highlight-intensity: var(--highlight-paper-intensity);
  --material-compress-distance: var(--physics-paper-compress);
  --material-timing: var(--timing-paper-interaction);

  background: var(--material-texture), var(--material-base-color);
  box-shadow: var(--elevation-2);
  transition-duration: 250ms;
  transition-timing-function: var(--material-timing);
}

.material-glass {
  --material-base-color: var(--material-glass-clear-base);
  --material-shadow-color: var(--shadow-glass-color);
  --material-highlight-intensity: var(--highlight-glass-intensity);
  --material-compress-distance: var(--physics-glass-compress);
  --material-timing: var(--timing-glass-interaction);

  background: var(--material-base-color);
  backdrop-filter: blur(12px);
  border: 2px solid rgba(255,255,255,0.3);
  box-shadow: var(--elevation-6), inset 0 1px 0 rgba(255,255,255,0.4);
  transition-duration: 300ms;
  transition-timing-function: var(--material-timing);
}

.material-fabric {
  --material-base-color: var(--material-fabric-linen-base);
  --material-texture: var(--texture-fabric-linen-weave);
  --material-shadow-color: var(--shadow-fabric-color);
  --material-highlight-intensity: var(--highlight-fabric-intensity);
  --material-compress-distance: var(--physics-fabric-compress);
  --material-timing: var(--timing-fabric-interaction);

  background: var(--material-texture), var(--material-base-color);
  box-shadow: var(--elevation-0);
  transition-duration: 400ms;
  transition-timing-function: var(--material-timing);
}
```

#### Interactive State Pattern Classes (Reusable Behaviors)

**Universal Interactive States**
```css
/* Hover State Pattern */
.interactive-hover:hover {
  filter: brightness(var(--material-hover-brightness));
  box-shadow:
    var(--material-shadow-color) 0 calc(var(--elevation-offset-y) * var(--feedback-hover-shadow-multiplier)) calc(var(--elevation-blur) * var(--feedback-hover-shadow-multiplier)),
    var(--material-shadow-color) 0 calc(var(--elevation-offset-y-secondary) * var(--feedback-hover-shadow-multiplier)) calc(var(--elevation-blur-secondary) * var(--feedback-hover-shadow-multiplier));

  /* Material-specific highlight enhancement */
  background-image:
    var(--material-texture),
    linear-gradient(var(--light-primary-angle), rgba(255,255,255,calc(var(--material-highlight-intensity) * var(--lighting-hover-boost))) 0%, transparent 50%),
    var(--material-base-color);
}

/* Active/Pressed State Pattern */
.interactive-active:active {
  transform: translateY(var(--material-compress-distance));
  filter: brightness(var(--material-active-brightness));
  box-shadow:
    var(--material-shadow-color) 0 calc(var(--elevation-offset-y) * var(--feedback-active-shadow-reduction)) calc(var(--elevation-blur) * var(--feedback-active-shadow-reduction)),
    inset 0 2px 4px var(--material-shadow-color);
}

/* Focus State Pattern */
.interactive-focus:focus {
  outline: none;
  box-shadow:
    var(--elevation-2),
    0 0 var(--feedback-focus-glow-size) calc(var(--feedback-focus-glow-size) / 2) var(--material-focus-color, var(--input-focus-glow-color)) alpha(var(--material-focus-glow-intensity));
}

/* Disabled State Pattern */
.interactive-disabled:disabled,
.interactive-disabled[aria-disabled="true"] {
  filter: brightness(var(--material-active-brightness)) saturate(var(--material-disabled-saturation));
  cursor: not-allowed;
  pointer-events: none;

  /* Simulate material wear/aging */
  background-image:
    var(--material-texture),
    radial-gradient(circle at 30% 70%, rgba(0,0,0,0.1) 20%, transparent 60%),
    var(--material-base-color);
}
```

#### Component-Specific Pattern Library

**Button Pattern System**
```css
/* Primary Action Button Pattern (Wood Material) */
.button-primary {
  @extend .material-component, .material-wood, .interactive-hover, .interactive-active, .interactive-focus;

  --material-base-color: var(--material-button-primary);
  --material-texture: var(--texture-wood-grain-walnut);
  --material-focus-color: #FF8C00;

  padding: 12px 24px;
  border: none;
  border-radius: var(--button-corner-radius);
  font-weight: 600;
  color: white;
  text-shadow: var(--button-text-shadow);
  cursor: pointer;
}

/* Secondary Action Button Pattern (Metal Material) */
.button-secondary {
  @extend .material-component, .material-metal, .interactive-hover, .interactive-active, .interactive-focus;

  --material-base-color: var(--material-button-secondary);
  --material-texture: var(--texture-metal-brushed-horizontal);
  --material-focus-color: #4A90E2;

  padding: 10px 20px;
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: var(--button-corner-radius);
  font-weight: 500;
  color: #333;
  cursor: pointer;
}
```

**Card Pattern System**
```css
/* Content Card Pattern (Paper Material) */
.card-content {
  @extend .material-component, .material-paper, .interactive-hover;

  --material-base-color: var(--material-surface-content);
  --material-texture: var(--texture-paper-fiber-fine);

  padding: var(--card-content-padding);
  border-radius: var(--card-corner-radius);
  box-shadow: var(--card-shadow-base);

  /* Hover enhancement for paper cards */
  &:hover {
    box-shadow: var(--card-shadow-hover);
    transform: translateY(calc(var(--card-hover-lift-distance) * -1));
  }
}

/* Interactive Card Pattern (Enhanced Paper with Selection) */
.card-interactive {
  @extend .card-content, .interactive-active, .interactive-focus;

  cursor: pointer;

  /* Selected state for interactive cards */
  &[aria-selected="true"] {
    box-shadow:
      var(--elevation-3),
      inset -4px 0 0 var(--material-wood-walnut-base);

    &::before {
      content: '';
      position: absolute;
      top: 8px;
      right: 8px;
      width: 12px;
      height: 8px;
      background: var(--material-wood-walnut-base);
      border-radius: 2px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);
    }
  }
}
```

**Input Pattern System**
```css
/* Text Input Pattern (Metal Frame + Paper Content) */
.input-text {
  @extend .material-component, .interactive-focus;

  position: relative;
  display: inline-block;

  /* Metal frame container */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--texture-metal-brushed-horizontal), var(--material-control-frame);
    border-radius: var(--input-corner-radius);
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
  }

  /* Paper content input field */
  input {
    position: relative;
    z-index: 1;
    margin: var(--input-metal-frame-width);
    padding: var(--input-paper-content-padding);
    background: var(--texture-paper-fiber-fine), var(--material-surface-content);
    border: none;
    border-radius: calc(var(--input-corner-radius) - var(--input-metal-frame-width));
    font-family: inherit;

    &:focus {
      box-shadow:
        inset 0 0 0 2px var(--input-focus-glow-color),
        0 0 var(--feedback-focus-glow-size) var(--input-focus-glow-color) alpha(0.3);
    }

    &:invalid {
      box-shadow:
        inset 0 0 0 2px var(--input-error-glow-color),
        0 0 var(--feedback-focus-glow-size) var(--input-error-glow-color) alpha(0.3);
    }
  }
}
```

### 2.1.5 Reusable Interaction Pattern Definitions

This section defines standardized interaction patterns that create consistent user experiences across all skeuomorphic components.

#### Universal Interaction Timing Patterns

**Material-Based Interaction Choreography**
```css
/* Reusable timing pattern definitions */
:root {
  /* Entry animations (component appears) */
  --timing-entry-wood: 400ms var(--timing-wood-interaction);
  --timing-entry-metal: 200ms var(--timing-metal-interaction);
  --timing-entry-paper: 300ms var(--timing-paper-interaction);
  --timing-entry-glass: 350ms var(--timing-glass-interaction);
  --timing-entry-fabric: 450ms var(--timing-fabric-interaction);

  /* Exit animations (component disappears) */
  --timing-exit-wood: 300ms var(--timing-wood-interaction);
  --timing-exit-metal: 150ms var(--timing-metal-interaction);
  --timing-exit-paper: 250ms var(--timing-paper-interaction);
  --timing-exit-glass: 300ms var(--timing-glass-interaction);
  --timing-exit-fabric: 350ms var(--timing-fabric-interaction);

  /* Interaction response (user input feedback) */
  --timing-response-immediate: 50ms linear;
  --timing-response-wood: 200ms var(--timing-wood-interaction);
  --timing-response-metal: 100ms var(--timing-metal-interaction);
  --timing-response-paper: 150ms var(--timing-paper-interaction);
}
```

#### Reusable Hover Pattern Definitions

**Progressive Hover Enhancement System**
```css
/* Base hover enhancement pattern */
.hover-enhance-standard {
  transition: all var(--timing-response-immediate);

  &:hover {
    /* Universal hover state properties */
    filter: brightness(var(--material-hover-brightness));
    transform: translateY(-1px);

    /* Material-specific enhancements */
    &.material-wood {
      transition-duration: var(--timing-response-wood);
      box-shadow:
        0 4px 8px var(--shadow-wood-color),
        inset 0 1px 0 rgba(255,255,255,0.3);
    }

    &.material-metal {
      transition-duration: var(--timing-response-metal);
      background-image:
        var(--material-texture),
        linear-gradient(var(--light-primary-angle), rgba(255,255,255,0.2) 0%, transparent 60%),
        var(--material-base-color);
    }

    &.material-paper {
      transition-duration: var(--timing-response-paper);
      box-shadow:
        0 3px 6px rgba(139,69,19,0.2),
        0 1px 3px rgba(0,0,0,0.1);
    }
  }
}

/* Subtle hover enhancement pattern (for secondary elements) */
.hover-enhance-subtle {
  transition: all var(--timing-response-immediate);

  &:hover {
    filter: brightness(1.05);

    &.material-wood {
      background-image:
        var(--material-texture),
        radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.1) 0%, transparent 50%),
        var(--material-base-color);
    }
  }
}
```

#### Reusable Press/Active Pattern Definitions

**Physical Material Press Response System**
```css
/* Standard press response pattern */
.press-response-standard {
  &:active {
    /* Immediate response for user feedback */
    transition-duration: var(--timing-response-immediate) !important;

    /* Physical depression simulation */
    transform: translateY(var(--material-compress-distance));

    /* Material-specific press effects */
    &.material-wood {
      filter: brightness(0.85);
      box-shadow:
        inset 0 2px 4px rgba(0,0,0,0.3),
        0 1px 2px var(--shadow-wood-color);
    }

    &.material-metal {
      filter: brightness(0.9);
      box-shadow:
        inset 0 1px 2px rgba(0,0,0,0.2),
        0 1px 1px var(--shadow-metal-color);
    }

    &.material-paper {
      filter: brightness(0.95);
      box-shadow:
        inset 0 1px 2px rgba(139,69,19,0.15),
        0 0 2px var(--shadow-paper-color);
    }
  }

  /* Recovery animation when press ends */
  &:not(:active) {
    transition-duration: var(--material-timing);
    transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1); /* Spring back effect */
  }
}

/* Gentle press response pattern (for delicate materials) */
.press-response-gentle {
  &:active {
    transition-duration: var(--timing-response-immediate) !important;

    &.material-glass {
      filter: brightness(1.1);
      background: var(--material-base-color);
      backdrop-filter: blur(8px);

      /* Glass surface flash effect */
      &::after {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.3) 0%, transparent 60%);
        pointer-events: none;
        animation: glass-flash 200ms ease-out;
      }
    }

    &.material-fabric {
      transform: translateY(var(--physics-fabric-compress));
      filter: brightness(0.98);
    }
  }
}

@keyframes glass-flash {
  0% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0; }
}
```

#### Reusable Focus Pattern Definitions

**Material-Aware Focus Indication System**
```css
/* Standard focus pattern for interactive elements */
.focus-standard {
  &:focus {
    outline: none;

    /* Material-specific focus treatments */
    &.material-wood {
      box-shadow:
        var(--elevation-2),
        0 0 0 3px #FF8C00 alpha(0.6),
        inset 0 0 0 2px rgba(255,140,0,0.2);
    }

    &.material-metal {
      box-shadow:
        var(--elevation-2),
        0 0 0 3px #4A90E2 alpha(0.7),
        inset 0 1px 0 rgba(74,144,226,0.3);
    }

    &.material-paper {
      box-shadow:
        var(--elevation-2),
        0 0 0 2px #666666 alpha(0.5),
        inset 0 0 8px rgba(102,102,102,0.1);
    }

    &.material-glass {
      box-shadow:
        var(--elevation-6),
        0 0 0 3px #FFFFFF alpha(0.8),
        inset 0 1px 0 rgba(255,255,255,0.6);
      border-color: rgba(255,255,255,0.5);
    }
  }

  /* Focus animation for enhanced visibility */
  &:focus {
    animation: material-focus-pulse 2s ease-in-out infinite;
  }
}

@keyframes material-focus-pulse {
  0%, 100% {
    box-shadow:
      var(--elevation-2),
      0 0 0 var(--feedback-focus-glow-size) var(--material-focus-color) alpha(var(--material-focus-glow-intensity));
  }
  50% {
    box-shadow:
      var(--elevation-2),
      0 0 0 calc(var(--feedback-focus-glow-size) * 1.3) var(--material-focus-color) alpha(calc(var(--material-focus-glow-intensity) * 0.7));
  }
}
```

#### Component Loading State Patterns

**Material-Appropriate Loading Animations**
```css
/* Wood material loading pattern */
.loading-wood {
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%),
      var(--texture-wood-grain-walnut),
      var(--material-wood-walnut-base);
    animation: wood-shine 2s ease-in-out infinite;
  }
}

@keyframes wood-shine {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* Metal material loading pattern */
.loading-metal {
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(45deg, transparent 0%, rgba(255,255,255,0.1) 10%, transparent 20%),
      var(--texture-metal-brushed-horizontal),
      var(--material-metal-steel-base);
    animation: metal-sweep 1.5s linear infinite;
  }
}

@keyframes metal-sweep {
  0% { background-position: -100% 0; }
  100% { background-position: 100% 0; }
}

/* Paper material loading pattern */
.loading-paper {
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: -50%;
    width: 50%;
    height: 100%;
    background: linear-gradient(90deg, transparent 0%, rgba(139,69,19,0.1) 50%, transparent 100%);
    animation: paper-read 2.5s ease-in-out infinite;
  }
}

@keyframes paper-read {
  0% { left: -50%; }
  100% { left: 100%; }
}
```

### 2.2 Core Visual Design Philosophy & Skeuomorphic Principles

**Primary Design Goal**: Transform Auto-Claude into a tactile, realistic interface that mimics a premium physical workspace where digital tools feel like authentic materials you can touch and manipulate.

**Visual Metaphor**: A sophisticated office environment combining traditional materials (wood, metal, paper, leather) with modern functionality, similar to high-end executive workspaces or artisan studios.

### 2.2a Skeuomorphic Design Principles

**Material Authenticity**: Each UI element must correspond to a believable real-world material with consistent physical properties across all themes.
- Wood elements feel solid and warm with visible grain patterns
- Metal surfaces show appropriate reflections and brushed textures
- Paper appears fibrous with subtle transparency and flexibility
- Glass maintains clarity with realistic refraction effects
- Fabric shows weave patterns and soft light absorption

**Depth Hierarchy**: Visual depth should directly correlate with functional importance and user interaction patterns.
- Primary actions elevated highest (wood buttons, key controls)
- Content surfaces at comfortable reading levels (paper cards)
- Background elements recessed appropriately (fabric textures)
- Interactive feedback follows realistic physics (press down, lift up)

**Tactile Feedback**: All interactive elements must provide realistic material responses to user input (press, hover, drag).
- Buttons compress realistically when clicked (1-2px depression)
- Hover states show material warming or highlighting
- Drag operations show material flexibility and resistance
- Focus states use natural material highlighting (inner glow, edge brightening)

**Lighting Consistency**: Unified lighting direction (top-left at 135°) across all elements with realistic shadow casting.
- Primary light source creates consistent highlight/shadow patterns
- Ambient occlusion adds depth in corners and edges
- Material-specific light responses (metal reflects, wood absorbs, glass refracts)
- Shadow colors match material properties (warm wood shadows, cool metal shadows)

**Material Physics**: Element behavior should respect real-world material properties (flexibility, hardness, transparency).
- Wood elements resist deformation, show grain direction influence
- Metal surfaces provide crisp edges with potential for small dings/wear
- Paper can fold, crease, and show subtle warping
- Glass maintains rigidity with potential for subtle flex under pressure
- Fabric shows gentle deformation and texture compliance

### 2.3 Visual Constraints & Design Rules

#### 2.3.1 Material Distribution Constraints

**60/25/10/4/1 Material Hierarchy Rule** (design-intent baseline):
- **Paper (60%)**: All primary content, reading surfaces, information display
- **Metal (25%)**: All secondary controls, frames, structural elements
- **Wood (10%)**: Primary actions only, key interactive elements
- **Glass (4%)**: Overlays, temporary states, modal surfaces only
- **Fabric (1%)**: Background textures, ambient surfaces only

> **⚠️ Per-screen targets are canonical.** The percentages above are defaults for new screens. Listed screens in the Screen Mapping table (Visual Architecture Decisions) have their own targets that override these values. See "Material Distribution Governance" for the complete exception rationale and §8.1.3 for the validation methodology.

**Material Mixing Prohibition**:
- Never combine more than 3 materials in a single component
- Avoid material transitions that break physical realism (wood morphing to metal)
- Maintain material boundaries with appropriate edge treatments

#### 2.3.2 Color Constraint System

**Material Color Authenticity Rules**:
- Wood colors must remain within natural wood tone ranges across all themes
- Metal colors constrained to realistic steel, aluminum, brass, copper variations
- Paper colors limited to natural fiber tones (cream, white, light gray, aged variants)
- Glass maintains transparency with subtle tinting only
- Fabric limited to natural textile colors (linen, cotton, canvas tones)

**Theme Adaptation Constraints**:
- Dark themes darken materials but maintain relative contrast relationships
- Material authenticity takes priority over theme color preferences
- Semantic colors (error, warning, success) applied as material treatments, not material replacement

#### 2.3.3 Depth & Elevation Constraints

**Maximum Elevation Limits**:
- Mobile/tablet: Maximum elevation level 4 (performance constraint)
- Desktop: Maximum elevation level 12 (visual hierarchy limit)
- No elements may exceed their functional elevation requirements

**Elevation Consistency Rules**:
- Components at same functional level must use identical elevation values
- Interactive feedback elevation changes limited to ±1 level from base
- Modal/overlay elevation must be minimum +6 from highest content elevation

#### 2.3.4 Typography Integration Constraints

**Material-Typography Harmony Rules**:
- Text on wood surfaces: Burned/carved appearance with appropriate shadow depth
- Text on metal surfaces: Etched or embossed treatment with metallic highlights
- Text on paper surfaces: Printed appearance with subtle ink transparency
- Text on glass surfaces: Frosted or etched treatment maintaining readability
- Never use flat text on three-dimensional material surfaces

**Readability Priority Constraint**:
- Material effects cannot reduce text contrast below WCAG AAA standards (7:1 normal text, 4.5:1 large text ≥18pt/14pt bold). For glass/overlay surfaces where AAA is technically infeasible, AA (4.5:1 normal text, 3:1 large text) is the documented floor — each exception requires a rationale in the component's accessibility notes.
- Material textures must not interfere with character recognition
- Alternative high-contrast versions required for accessibility modes

#### 2.3.5 Animation & Interaction Constraints

**Material Physics Timing**:
- Wood interactions: Slower, solid feeling (300-400ms transitions)
- Metal interactions: Crisp, immediate (150-200ms transitions)
- Paper interactions: Light, flexible (200-250ms transitions)
- Glass interactions: Delicate, smooth (250-300ms transitions)
- Fabric interactions: Soft, gradual (350-450ms transitions)

**Interaction Feedback Requirements**:
- Every clickable element must provide visual material feedback within 50ms
- Hover states must begin within 100ms of pointer entry
- Material deformation must reset within 200ms of interaction end
- No interactions may break material physics rules (wood doesn't bend like rubber)

#### 2.3.6 Performance Constraints

**Rendering Optimization Limits**:
- Maximum 3 CSS gradients per element (texture + lighting + highlight)
- Box-shadow limited to 4 layers maximum per element
- Backdrop-filter usage limited to modals and glass elements only
- Transform3d required for all elevation animations (hardware acceleration)

**Texture Complexity Limits**:
- Wood grain patterns: Maximum 2 overlay textures
- Metal brushing: Single directional pattern only
- Paper fiber: Subtle noise pattern only, no complex weaves
- Fabric: Simple weave patterns, avoid high-frequency detail

### 2.4 Cross-Theme Material Consistency Framework

#### 2.4.1 Light Theme Material Specifications

**Environmental Context**: Bright office environment with natural lighting
- **Wood**: Warm walnut/mahogany with prominent grain visibility
- **Metal**: Bright brushed steel with clear highlights
- **Paper**: Warm cream with visible fiber texture
- **Glass**: Crystal clear with bright edge highlights
- **Fabric**: Natural linen with visible weave structure

#### 2.4.2 Dark Theme Material Adaptations

**Environmental Context**: Evening/ambient office environment
- **Wood**: Same species but darker stained, grain still visible
- **Metal**: Darker metals (gunmetal, dark steel) with subdued highlights
- **Paper**: Darker paper stocks (off-white to light gray) maintaining texture
- **Glass**: Slight gray tinting while preserving transparency
- **Fabric**: Darker fabric tones with preserved weave visibility

#### 2.4.3 Theme-Neutral Material Properties

**Unchanging Material Characteristics**:
- Wood grain patterns remain consistent across themes
- Metal brushing direction and intensity stay constant
- Paper fiber texture density unchanged
- Glass clarity percentage maintained (only tinting varies)
- Fabric weave structure preserved across color variations

### 2.5 Accessibility Integration Requirements

#### 2.5.1 High Contrast Mode Adaptations

**Material Simplification Rules**:
- Complex textures reduced to essential shape and contrast elements
- Material depth cues simplified to border and background color changes
- Interactive states must remain identifiable without subtle material effects
- Focus indicators enhanced to work without material-based highlighting

#### 2.5.2 Reduced Motion Accessibility

**Material Physics Alternatives**:
- Material compression animations replaced with color/border changes
- Elevation changes shown through immediate shadow/border updates
- Hover effects limited to color transitions only
- No easing curves for material physics when reduced motion active

### 2.6 Detailed Visual Direction Specifications

#### 2.6.1 Material Texture Implementation Standards

**Wood Texture Specifications**:
- **Grain Pattern**: Diagonal grain direction at 30-45° angle from horizontal
- **Grain Density**: 3-5 visible grain lines per 100px width
- **Color Variation**: ±15% lightness variation within single wood element
- **Surface Treatment**: Subtle satin finish with controlled reflectivity (max 20% highlight strength)
- **Edge Treatment**: Slightly rounded corners (2-4px radius) to simulate natural wear
- **Grain Depth**: Simulated depth of 0.5-1px using inner shadows and highlights

**Metal Texture Specifications**:
- **Brushing Direction**: Consistent horizontal brushing pattern across all metal elements
- **Brushing Density**: 1-2 pixel wide brush lines with 2-3 pixel gaps
- **Surface Reflection**: Linear gradient highlight at 135° angle covering 30% of surface
- **Edge Definition**: Crisp, sharp edges with 1px highlight on top/left edges
- **Oxidation Pattern**: Subtle darkening (5-10%) in corners and recessed areas
- **Surface Scratches**: Minimal surface imperfections (max 2-3 per 200px surface)

**Paper Texture Specifications**:
- **Fiber Pattern**: Subtle noise pattern with 2-3% opacity variation
- **Surface Texture**: Light embossed effect using multiple subtle inner shadows
- **Edge Treatment**: Very slight roughness using micro-variations in border (0.5px variance)
- **Transparency**: 95-98% opacity to suggest paper thickness without obscuring content
- **Aging Effects**: Optional light yellowing (2-5% warm tint) for used paper metaphor
- **Fold Lines**: Optional subtle crease lines for paper that appears handled

**Glass Texture Specifications**:
- **Clarity Level**: 85-92% transparency with subtle background blur
- **Edge Highlights**: Bright edge lighting using 2-3px white border at 60-80% opacity
- **Refraction Simulation**: Subtle background distortion using backdrop-filter blur (3-6px)
- **Surface Reflection**: Diagonal highlight gradient at 45° covering 15-25% of surface
- **Thickness Indicator**: Edge bevel effect using gradient borders to suggest glass depth
- **Cleanliness**: Pristine surface (no smudges or imperfections in UI context)

**Fabric Texture Specifications**:
- **Weave Pattern**: Simple over-under weave visible at 150-200% zoom
- **Thread Count**: 4-6 visible threads per 20px in both directions
- **Surface Variation**: Subtle height variation (±1px) following weave pattern
- **Light Absorption**: Matte finish with minimal reflectivity (5-10% max highlight)
- **Edge Fraying**: Optional subtle edge softening for natural fabric appearance
- **Color Saturation**: Slightly muted colors (85-90% saturation) for natural textile feel

#### 2.6.2 Lighting System Specifications

**Primary Light Source Requirements**:
- **Direction**: Consistent 135° angle (top-left to bottom-right)
- **Intensity**: 40-60% brightness increase on illuminated surfaces
- **Color Temperature**: 5500K-6500K (natural daylight) for light themes, 3200K-4000K (warm light) for dark themes
- **Shadow Casting**: All elevated elements cast shadows in consistent 315° direction (opposite of light)
- **Falloff**: Linear light intensity reduction from 100% at light-facing edge to 60% at shadow-facing edge

**Shadow System Specifications**:
- **Ambient Occlusion**: Subtle darkening (10-20%) in corners and recessed areas
- **Contact Shadows**: Sharp, dark shadows (60-80% opacity) directly beneath elevated elements
- **Cast Shadows**: Softer shadows (20-40% opacity) extending 0.5-2x the element's elevation distance
- **Shadow Color**:
  - Light themes: Cool shadows (#000000 with 15-30% opacity)
  - Dark themes: Warmer shadows (#1a0f0a with 20-35% opacity)
- **Multiple Shadow Layers**: Maximum 3 shadow layers per element (contact, cast, ambient)

**Highlight System Specifications**:
- **Primary Highlights**: 80-100% white on light-facing edges and corners
- **Secondary Highlights**: 40-60% white on surfaces receiving indirect light
- **Material-Specific Behavior**:
  - Wood: Subtle highlights following grain direction
  - Metal: Strong, crisp highlights with sharp falloff
  - Paper: Soft, diffuse highlights
  - Glass: Sharp edge highlights with surface reflections
  - Fabric: Diffuse highlights following weave pattern

#### 2.6.3 Interactive Feedback Visual Specifications

**Button Press Simulation Standards**:
- **Depression Distance**: 1-2px downward movement on click
- **Shadow Reduction**: 50% reduction in cast shadow during press
- **Surface Darkening**: 10-15% darker surface color during active state
- **Highlight Shift**: Primary highlight moves from top-left to bottom-right during press
- **Recovery Time**: 200ms spring transition back to rest state

**Hover Enhancement Standards**:
- **Brightness Increase**: 5-10% lighter surface color during hover
- **Highlight Enhancement**: 20-30% stronger primary highlight
- **Shadow Extension**: 10-20% larger cast shadow during hover
- **Transition Timing**: 150ms ease-out transition into hover state
- **Cursor Integration**: Cursor changes to indicate material interactivity

**Focus Indicator Specifications**:
- **Ring Style**: 2-3px outer glow using material-appropriate colors
- **Ring Colors**:
  - Wood elements: Warm orange glow (#FF8C00 at 60% opacity)
  - Metal elements: Cool blue glow (#4A90E2 at 70% opacity)
  - Paper elements: Neutral gray glow (#666666 at 50% opacity)
  - Glass elements: Bright white glow (#FFFFFF at 80% opacity)
- **Animation**: Subtle pulse effect (2-3 second cycle)

#### 2.6.4 Depth Relationship Visual Hierarchy

**Elevation Level Definitions** (Light Theme Reference):
- **Level 0 (Recessed)**: inset 1px 1px 2px rgba(0,0,0,0.1), background 5% darker
- **Level 1 (Flush)**: No shadow, surface level with background
- **Level 2 (Raised)**: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)
- **Level 3 (Elevated)**: 0 3px 6px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.12)
- **Level 4 (Floating)**: 0 6px 12px rgba(0,0,0,0.15), 0 4px 8px rgba(0,0,0,0.12)
- **Level 6 (Modal)**: 0 12px 28px rgba(0,0,0,0.15), 0 8px 16px rgba(0,0,0,0.12)
- **Level 8 (Overlay)**: 0 16px 36px rgba(0,0,0,0.18), 0 12px 24px rgba(0,0,0,0.15)

**Component Elevation Assignments**:
- Background/Fabric: Level 0 (recessed texture)
- Paper Cards: Level 2 (readable surface)
- Buttons (Rest): Level 2 (interactive surface)
- Buttons (Hover): Level 3 (enhanced interactivity)
- Navigation Elements: Level 2-3 (accessible controls)
- Modal Backdrops: Level 6 (overlay separation)
- Dropdown Menus: Level 4 (temporary elevation)
- Tooltips: Level 8 (highest priority information)

#### 2.6.5 Color Harmony and Material Consistency

**Material Color Authenticity Matrix**:

**Wood Colors (Theme-Neutral Base)**:
> **⚠️ CORRECTED**: Canonical wood variant names are `walnut | mahogany | oak` (matching `design-system/types.ts` and `design-system/tokens/materials.css`). "Cherry" was a phantom name from an earlier draft; the actual third wood variant is **oak**.

- Light Walnut: #D4A574 (base), #B8956A (shadows), #E8C992 (highlights)
- Dark Walnut: #8B4513 (base), #6B3410 (shadows), #A85D1B (highlights)
- Mahogany: #A0522D (base), #7D3F23 (shadows), #C06638 (highlights)
- Oak: #654321 (base), #3D2914 (shadows), #8B4513 (highlights)

**Metal Colors (Theme-Adaptive)**:
> **⚠️ CORRECTED**: Canonical metal variant names are `platinum | steel | titanium` (matching `design-system/types.ts` and `design-system/tokens/materials.css`). "Aluminum" and "Dark Steel" were phantom names from an earlier draft.

- Platinum: #E8E8E8 (base), #D0D0D0 (shadows), #F5F5F5 (highlights)
- Brushed Steel: #D4D4D4 (base), #B8B8B8 (shadows), #E8E8E8 (highlights)
- Titanium: #4A4A4A (base), #2A2A2A (shadows), #6A6A6A (highlights)
- Copper: #B87333 (base), #8B4513 (shadows), #CD853F (highlights) *(aspirational — not in current token set)*

**Paper Colors (Texture-Consistent)**:
- Natural White: #FEFCF8 (base), #F5F2EA (shadows), #FFFFFF (highlights)
- Cream: #F5F2EA (base), #E8E4D6 (shadows), #FEFCF8 (highlights)
- Light Gray: #F8F8F8 (base), #EEEEEE (shadows), #FFFFFF (highlights)
- Aged Paper: #F4F1E8 (base), #E6E2D5 (shadows), #FEFCF8 (highlights)

**Theme Adaptation Rules**:
- **Hue Preservation**: Material base hues remain constant across themes
- **Saturation Limits**: Maximum ±20% saturation change between themes
- **Brightness Range**: Wood: 15-85% brightness, Metal: 25-95%, Paper: 85-98%
- **Contrast Maintenance**: 7:1 minimum contrast ratio for normal text on any material surface (WCAG AAA); 4.5:1 for large text (≥18pt/14pt bold); 4.5:1 AA floor for glass/overlay surfaces with documented rationale
- **Harmony Verification**: Adjacent materials must maintain 2:1 minimum contrast ratio

#### 2.6.6 Implementation Validation Criteria

**Material Authenticity Tests**:
- Each material must pass "believability test" - would users recognize the material?
- Material combinations must feel naturally compatible
- Lighting effects must be consistent across all material instances
- Material wear/aging must follow realistic patterns if applied

**Interaction Fidelity Tests**:
- All interactions must feel responsive within material constraints
- Material feedback must enhance (not hinder) functional understanding
- Interactive affordances must be immediately apparent through material cues
- Material transitions must feel smooth and purposeful, never jarring

**Cross-Theme Validation Tests**:
- Material authenticity preserved across all 9 color themes
- Relative contrast relationships maintained between materials in all themes
- Interactive states remain clearly distinguishable in all themes
- Accessibility standards met in all theme combinations

**Performance Validation Tests**:
- Smooth 60fps animations on target hardware (Intel i5-8400, 8GB RAM minimum)
- Initial render time <50ms per component
- Memory usage increase <15% from current baseline per component
- No visual artifacts on common screen resolutions (1920x1080, 2560x1440, 3840x2160)

### 2.2b Material Distribution Strategy (60/25/10/4/1 Rule)

> **Design-intent baseline** for new screens not yet in the Screen Mapping table. For listed screens, per-screen targets (Visual Architecture Decisions → Screen Mapping) are the canonical source of truth and override these percentages. Measurement methodology: §8.1.3.

**Paper Materials (60% - Content Surfaces)**
- Main content areas, task descriptions, text blocks
- Reading surfaces, documentation panels
- Background content in cards and panels
- Color: Warm whites (#FEFCF8 to #F5F2EA)

**Metal Materials (25% - Control Surfaces)**
- Secondary buttons, form controls, input frames
- Toolbar backgrounds, navigation elements
- Control panel surfaces, settings interfaces
- Color: Steel grays (#D4D4D4 to #4A4A4A)

**Wood Materials (10% - Primary Actions)**
- Primary buttons, key interactive elements
- Navigation highlights, important actions
- Call-to-action surfaces, confirmation buttons
- Color: Rich browns (#8B4513 to #A0522D)

**Glass Materials (4% - Overlay Surfaces)**
- Modal backgrounds, tooltip surfaces
- Dropdown menus, popover containers
- Overlay panels, temporary interfaces
- Transparency: rgba(255,255,255,0.75-0.85)

**Fabric Materials (1% - Texture Backgrounds)**
- Application backgrounds, subtle textures
- Section dividers, ambient surfaces
- Decorative elements, texture accents
- Color: Neutral linens (#F7F5F3 to #F2F0ED)

### 2.3 Theme-Specific Material Adaptations

**Lighting and Material Consistency Across Themes:**

Each theme maintains material authenticity while adjusting for environmental context:

**Default Theme (Natural Office Environment)**
- Wood: Walnut and mahogany with natural grain
- Metal: Brushed steel with subtle highlights
- Paper: Warm cream with fiber texture
- Glass: Clear with natural light refraction
- Fabric: Natural linen with visible weave

**Dark Themes (Evening/Night Environments)**
- Wood: Darker stains with subdued grain visibility
- Metal: Darker metals with reduced highlights
- Paper: Darker papers with maintained texture
- Glass: Slightly tinted glass maintaining transparency
- Fabric: Darker fabric tones with preserved texture

## 3. Component-by-Component Redesign Specifications

### 3.1 Navigation Components

#### Sidebar Redesign
**Material Mapping:**
- Background: Metal (brushed steel texture)
- Active items: Wood inlay with subtle grain
- Icons: Etched metal appearance
- Hover states: Subtle metal highlight with realistic lighting

**Interaction Design:**
- Buttons depress slightly when clicked (2px inset)
- Hover adds metal highlight gradient
- Active state shows recessed wood panel behind icon
- Focus outline uses realistic metal border

#### Project Tab Bar Redesign
**Material Mapping:**
- Tab surfaces: Metal control panels
- Active tab: Raised wood panel with grain texture
- Inactive tabs: Flat metal with subtle texture
- Close buttons: Small metal buttons with X etching

### 3.2 Task Management Components

#### TaskCard Redesign
**Material Mapping:**
- Card surface: Paper with fiber texture and realistic shadows
- Priority badges: Metal nameplate with etched text
- Status indicators: Wood burned or metal stamped text
- Action buttons: Wood (primary) and metal (secondary) with realistic depth

**Depth Hierarchy:**
- Base card: Elevation level 2 (paper card standard)
- Hover state: Elevation level 3 (slight lift)
- Active/selected: Elevation level 1 (pressed down)
- Critical tasks: Wood accent strip on left edge

#### KanbanBoard Redesign
**Material Mapping:**
- Column headers: Wood panels with carved text
- Column backgrounds: Fabric texture with subtle weave
- Drag handles: Metal grip texture
- Drop zones: Subtle material highlighting

### 3.3 Interactive Controls

#### Button System Redesign
**Primary Buttons (Wood Material):**
```css
/* Wood button with grain texture and realistic shadows */
background:
  var(--texture-wood-grain),
  linear-gradient(135deg, #A0522D 0%, #8B4513 50%, #654321 100%);
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.2),
  0 2px 4px rgba(101,67,33,0.3),
  0 1px 2px rgba(0,0,0,0.2);
border-radius: 8px;
text-shadow: 0 1px 1px rgba(0,0,0,0.3);

/* Hover state: enhanced lighting */
:hover {
  background:
    var(--texture-wood-grain),
    linear-gradient(135deg, #B8622D 0%, #A0522D 50%, #754321 100%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.3),
    0 3px 6px rgba(101,67,33,0.4),
    0 2px 3px rgba(0,0,0,0.25);
}

/* Active state: pressed down */
:active {
  background:
    var(--texture-wood-grain),
    linear-gradient(135deg, #904213 0%, #754321 50%, #543021 100%);
  box-shadow:
    inset 0 2px 4px rgba(0,0,0,0.3),
    0 1px 2px rgba(101,67,33,0.2);
  transform: translateY(1px);
}
```

**Secondary Buttons (Metal Material):**
```css
/* Metal button with brushed texture */
background:
  var(--texture-metal-brushed),
  linear-gradient(135deg, #E8E8E8 0%, #D4D4D4 50%, #B8B8B8 100%);
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.4),
  0 1px 3px rgba(0,0,0,0.2),
  0 1px 2px rgba(0,0,0,0.1);
```

#### Form Controls Redesign
**Input Fields:**
- Inset metal frame with realistic depth
- Paper-textured content area
- Focus state adds subtle inner glow
- Error states use warm warning colors maintaining material authenticity

### 3.4 Overlay Components

#### Modal Dialog Redesign
**Material Structure:**
- Backdrop: Semi-transparent fabric texture
- Modal container: Layered glass panel with realistic refraction
- Content area: Paper surface with appropriate elevation
- Action buttons: Wood (confirm) and metal (cancel) materials

**Realistic Layering:**
```css
/* Modal backdrop with fabric texture */
.modal-backdrop {
  background:
    var(--texture-fabric-linen),
    rgba(44, 44, 44, 0.75);
  backdrop-filter: blur(8px);
}

/* Modal container with glass material */
.modal-container {
  background: var(--material-glass-clear);
  backdrop-filter: blur(12px);
  border: 2px solid rgba(255,255,255,0.3);
  box-shadow:
    0 12px 28px rgba(0,0,0,0.15),
    inset 0 1px 0 rgba(255,255,255,0.4);
  border-radius: 12px;
}
```

### 3.5 Feedback Components

#### Loading States Redesign
- Progress bars: Metal rails with wood slider
- Spinners: Realistic rotating metal elements
- Skeleton states: Paper texture with subtle pulse

#### Notification System Redesign
- Toast notifications: Small wood panels sliding in from edge
- Status indicators: Metal badges with appropriate material finish
- Alert banners: Paper notices with realistic fold/crease effects

## 4. Technical Implementation Strategy

### 4.1 CSS Custom Property System

**Material Token Expansion:**
```css
:root {
  /* Enhanced material definitions with interactive states */
  --material-wood-walnut-rest: #8B4513;
  --material-wood-walnut-hover: #A0522D;
  --material-wood-walnut-active: #654321;
  --material-wood-walnut-disabled: #A08060;

  /* Material-specific interaction properties */
  --material-wood-compress: translateY(1px);
  --material-metal-shine: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%);
  --material-paper-fold: inset 1px 1px 2px rgba(0,0,0,0.1);
}
```

### 4.2 Component Architecture

**Material-Aware Component Classes:**
```css
/* Base material system classes */
.material-wood { /* Wood material properties */ }
.material-metal { /* Metal material properties */ }
.material-paper { /* Paper material properties */ }
.material-glass { /* Glass material properties */ }
.material-fabric { /* Fabric material properties */ }

/* Interactive state modifiers */
.interactive-wood:hover { /* Wood hover response */ }
.interactive-metal:active { /* Metal press response */ }
.interactive-paper:focus { /* Paper focus response */ }
```

### 4.3 Performance Considerations

**Optimization Strategy:**
- Maximum 3 gradients per element for texture rendering
- Hardware acceleration for smooth material transitions
- Responsive elevation limits for mobile devices
- Progressive enhancement for complex textures

**Browser Compatibility:**
- CSS Grid and Flexbox for layout (95%+ support)
- CSS Custom Properties (92%+ support)
- Backdrop-filter with fallbacks (85%+ support)
- CSS transforms for material physics (98%+ support)

### 4.4 Accessibility Integration

**Material-Aware Accessibility:**
- High contrast mode disables subtle textures
- Reduced motion removes material physics
- Screen reader descriptions include material metaphors
- Focus indicators work with material surfaces

**WCAG Compliance:**
- 7:1 contrast ratio maintained across all material combinations (AAA target; 4.5:1 AA floor for glass)
- Material physics don't interfere with keyboard navigation
- Alternative text describes material context where relevant

## 5. Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Deliverables:**
- Enhanced material token system
- Base material component classes
- Core interaction physics CSS
- Theme integration testing

**Files to Create/Modify:**
- `src/renderer/design-system/tokens/materials-enhanced.css`
- `src/renderer/design-system/components/material-base.css`
- `src/renderer/design-system/interactions/material-physics.css`

### Phase 2: Core Components (Week 3-4)
**Deliverables:**
- Redesigned Button component with wood/metal materials
- Enhanced TaskCard with paper surface and material badges
- Updated Sidebar with metal panel design
- Form controls with inset metal frames

**Files to Modify:**
- `src/renderer/components/ui/button.tsx`
- `src/renderer/components/TaskCard.tsx`
- `src/renderer/components/Sidebar.tsx`
- Form component files

### Phase 3: Layout & Navigation (Week 5-6)
**Deliverables:**
- Skeuomorphic ProjectTabBar with metal/wood materials
- Enhanced KanbanBoard with fabric backgrounds
- Realistic modal system with glass materials
- Navigation depth hierarchy

**Files to Modify:**
- `src/renderer/components/ProjectTabBar.tsx`
- `src/renderer/components/KanbanBoard.tsx`
- Modal and dialog components

### Phase 4: Polish & Testing (Week 7-8)
**Deliverables:**
- Animation and micro-interaction refinement
- Cross-theme material consistency testing
- Performance optimization
- Accessibility compliance verification

## 6. Quality Assurance & Success Metrics

### 6.1 Visual Consistency Checklist
- [ ] All screens respect their per-screen material distribution targets (Screen Mapping table); new screens not yet listed default to 60/25/10/4/1 ±5%
- [ ] Consistent lighting direction across all elements
- [ ] Material authenticity maintained across all 9 themes
- [ ] No flat elements remaining in primary interaction areas
- [ ] Realistic depth relationships throughout interface

### 6.2 Interaction Quality Metrics
- [ ] All buttons provide appropriate material feedback
- [ ] Hover states enhance material appearance realistically
- [ ] Focus indicators work naturally with material surfaces
- [ ] Disabled states maintain material authenticity
- [ ] Loading states use material-appropriate animations

### 6.3 Performance Benchmarks
- [ ] No more than 3 gradients per UI element
- [ ] Smooth 60fps transitions on target hardware
- [ ] Mobile elevation limits respected (max level 4)
- [ ] Memory usage increase <10% from current baseline
- [ ] Initial paint time impact <100ms

### 6.4 Accessibility Compliance
- [ ] WCAG AAA contrast compliance in all themes (7:1 normal text; 4.5:1 large text; AA floor for glass)
- [ ] High contrast mode functionality preserved
- [ ] Reduced motion preferences respected
- [ ] Screen reader compatibility maintained
- [ ] Keyboard navigation unimpeded by material effects

## 7. Risk Mitigation Strategies

### 7.1 Technical Risks

**Performance Impact Risk**
- **Mitigation**: Progressive enhancement, mobile-specific optimizations
- **Fallback**: Simplified material effects for low-end devices

**Browser Compatibility Risk**
- **Mitigation**: Graceful fallbacks for unsupported CSS features
- **Testing**: Comprehensive cross-browser validation

**Theme System Integration Risk**
- **Mitigation**: Incremental rollout with theme-by-theme validation
- **Rollback**: Maintain current theme system as fallback

### 7.2 UX Risks

**User Adaptation Risk**
- **Mitigation**: Gradual rollout with user feedback integration
- **Training**: In-app onboarding for new material metaphors

**Accessibility Regression Risk**
- **Mitigation**: Parallel accessibility testing throughout development
- **Validation**: Regular screen reader and keyboard testing

### 2.7 Material System Component Library

#### 2.7.1 Wood Material Component Specifications

**Button Components (Primary Actions)**:
- **Surface Treatment**: Visible wood grain at 45° diagonal orientation
- **Edge Profile**: Rounded corners (6-8px radius) with subtle bevel effect
- **Interaction States**:
  - Rest: Standard wood tone with subtle highlight on top edge
  - Hover: 10% brightness increase with enhanced grain visibility
  - Active: 2px depression with shadow reduction and darker tone
  - Disabled: 50% saturation reduction with worn appearance
- **Typography Integration**: Text appears "burned" or "carved" into wood surface
- **Performance Requirements**: Maximum 2 gradient layers for grain + lighting

**Navigation Elements (Secondary Wood Usage)**:
- **Panel Backgrounds**: Subtle wood texture at 20% opacity
- **Active State Indicators**: Solid wood inlay strips (3-4px width)
- **Divider Elements**: Wood grain pattern following natural splitting direction

#### 2.7.2 Metal Material Component Specifications

**Control Surfaces (Secondary Actions)**:
- **Surface Treatment**: Horizontal brushed metal pattern (2px line spacing)
- **Reflection System**: Linear highlight at 135° angle covering 25% of surface
- **Edge Definition**: Sharp, precise edges with 1px top/left highlight
- **Interaction States**:
  - Rest: Standard brushed appearance with consistent directional lighting
  - Hover: Enhanced reflection intensity (+20%) with subtle surface warming
  - Active: Slight surface darkening with reduced highlight intensity
  - Focus: Crisp blue outline (2px width) simulating electrical activation
- **Typography Integration**: Etched or embossed text appearance with edge definition

**Frame Components (Structural Metal)**:
- **Border Treatments**: Metal frame with realistic corner joints
- **Surface Variation**: Slight brushing pattern inconsistencies for authenticity
- **Wear Patterns**: Subtle darkening at high-contact areas (corners, handles)

#### 2.7.3 Paper Material Component Specifications

**Content Surfaces (Primary Reading Areas)**:
- **Fiber Texture**: Subtle paper fiber pattern at 3-5% opacity variation
- **Surface Properties**:
  - Light absorption: Matte finish with minimal reflectivity
  - Edge treatment: Slight thickness indication through micro-shadows
  - Aging effects: Optional subtle yellowing for document metaphors
- **Interaction States**:
  - Rest: Clean white/cream surface with visible fiber texture
  - Hover: Subtle shadow darkening (5% darker) as if under magnification
  - Selected: Slight curl/lift effect with enhanced shadow depth
  - Focus: Soft pencil-line border indicating selection

**Card Components**:
- **Elevation Response**: Paper appears to lift naturally with curved shadow
- **Content Integration**: Text appears printed on paper surface with ink depth
- **Fold Lines**: Optional subtle creases for heavily-used document appearance

#### 2.7.4 Glass Material Component Specifications

**Overlay Components (Modal Surfaces)**:
- **Transparency Levels**: 85-90% transparency with subtle background blur
- **Edge Treatments**: Bright white/blue edge highlighting (2-3px width)
- **Surface Properties**:
  - Refraction simulation: Subtle background distortion (3-5px blur)
  - Surface cleanliness: No fingerprints or smudges in UI context
  - Thickness indication: Beveled edges to suggest glass depth
- **Interaction States**:
  - Rest: Crystal clarity with minimal surface effects
  - Hover: Enhanced edge brightness (+30%) with slight surface flash
  - Active: Brief surface flash effect simulating touch interaction

**Tooltip Components**:
- **Minimal Glass**: High transparency (90-95%) with focused edge definition
- **Content Visibility**: Background blur ensures readability without obscuring too much
- **Positioning**: Glass thickness effects don't interfere with precise positioning

#### 2.7.5 Fabric Material Component Specifications

**Background Components (Ambient Textures)**:
- **Weave Patterns**: Simple linen weave visible at high zoom levels
- **Surface Properties**:
  - Light absorption: High absorption with soft shadow acceptance
  - Texture depth: Minimal depth variation (±0.5px) following weave
  - Color saturation: Naturally muted colors (80-90% saturation)
- **Application Areas**:
  - Application backgrounds: Subtle texture that doesn't interfere with content
  - Section dividers: Fabric strip appearance with natural edge fraying
  - Decorative elements: Minimal fabric accents without overwhelming design

### 2.8 Component State Management System

#### 2.8.1 Universal Interaction State Definitions

**Rest State Requirements** (All Materials):
- **Appearance**: Material at natural state with appropriate lighting and texture
- **Positioning**: Base elevation level appropriate for component function
- **Timing**: Immediate application on component mount
- **Accessibility**: Must meet minimum contrast requirements in this state

**Hover State Requirements** (Material-Specific Timing):
- **Wood Components**: 300ms ease-in transition with brightness increase
- **Metal Components**: 150ms linear transition with reflection enhancement
- **Paper Components**: 200ms ease-out transition with subtle shadow deepening
- **Glass Components**: 250ms ease-in-out transition with edge brightness
- **Fabric Components**: 350ms ease-out transition with texture emphasis

**Active/Pressed State Requirements**:
- **Visual Response Timing**: Must begin within 50ms of interaction start
- **Material Deformation**: Physical depression/compression appropriate to material
- **Recovery Timing**: Must return to rest state within 200ms of interaction end
- **Feedback Intensity**: Sufficient to confirm interaction without breaking material physics

**Focus State Requirements** (Keyboard Navigation):
- **Visibility Standard**: Focus indication must be visible in all themes and lighting conditions
- **Material Integration**: Focus effects work with material surface without breaking authenticity
- **Contrast Requirements**: Minimum 3:1 contrast ratio between focus indicator and background
- **Animation**: Optional subtle pulsing (2-3 second cycle) for enhanced visibility

**Disabled State Requirements**:
- **Visual Treatment**: Material appears worn, faded, or damaged in believable way
- **Interaction Prevention**: No hover, active, or focus states possible
- **Accessibility**: Must still meet contrast requirements for text content
- **Material Integrity**: Disabled appearance follows realistic material degradation patterns

#### 2.8.2 Component-Specific State Behaviors

**Button State Progression**:
1. **Rest → Hover**: Material surface enhancement (brightness, reflection, texture)
2. **Hover → Active**: Physical depression with shadow reduction
3. **Active → Rest**: Spring-back recovery with appropriate material physics
4. **Any State → Disabled**: Gradual material degradation animation
5. **Disabled → Enabled**: Material restoration animation

**Card/Panel State Progression**:
1. **Rest → Hover**: Subtle elevation increase with enhanced paper texture
2. **Hover → Selected**: Paper curl effect with deepened shadow
3. **Selected → Rest**: Gentle settling animation back to base elevation

**Input Field State Progression**:
1. **Rest → Focus**: Inner metal frame highlight with paper content area brightening
2. **Focus → Error**: Warm warning color integration without breaking material authenticity
3. **Error → Valid**: Gentle transition back to natural material state

### 2.9 Implementation-Ready CSS Architecture

#### 2.9.1 Material Token System Structure

**CSS Custom Property Hierarchy**:
```css
:root {
  /* Material base colors (theme-neutral authentic colors) */
  --material-wood-walnut-base: #8B4513;
  --material-metal-steel-base: #D4D4D4;
  --material-paper-cream-base: #FEFCF8;
  --material-glass-clear-base: rgba(255,255,255,0.85);
  --material-fabric-linen-base: #F7F5F3;

  /* Material interaction modifiers */
  --material-wood-hover-brightness: 1.1;
  --material-metal-hover-reflection: 1.2;
  --material-paper-hover-shadow: 1.15;
  --material-glass-hover-edge: 1.3;
  --material-fabric-hover-texture: 1.05;

  /* Material physics properties */
  --material-wood-compress-distance: 2px;
  --material-metal-compress-distance: 1px;
  --material-paper-compress-distance: 0.5px;
  --material-glass-compress-distance: 0px;
  --material-fabric-compress-distance: 3px;

  /* Material timing functions */
  --material-wood-timing: cubic-bezier(0.4, 0.0, 0.2, 1);
  --material-metal-timing: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --material-paper-timing: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --material-glass-timing: cubic-bezier(0.4, 0.0, 0.6, 1);
  --material-fabric-timing: cubic-bezier(0.23, 1, 0.320, 1);
}
```

#### 2.9.2 Component Architecture Pattern

**Material-Aware Component Base Class**:
```css
.material-component {
  /* Universal material properties */
  position: relative;
  transition-property: transform, box-shadow, background, border;
  will-change: transform, box-shadow;

  /* Material physics preparation */
  transform-style: preserve-3d;
  backface-visibility: hidden;
}

/* Material-specific base classes */
.material-wood {
  background:
    var(--texture-wood-grain),
    var(--material-wood-color, var(--material-wood-walnut-base));
  box-shadow: var(--material-wood-shadow-rest);
  transition-duration: 300ms;
  transition-timing-function: var(--material-wood-timing);
}

.material-wood.interactive:hover {
  filter: brightness(var(--material-wood-hover-brightness));
  box-shadow: var(--material-wood-shadow-hover);
}

.material-wood.interactive:active {
  transform: translateY(var(--material-wood-compress-distance));
  box-shadow: var(--material-wood-shadow-active);
  filter: brightness(0.9);
}
```

#### 2.9.3 Performance-Optimized Texture Definitions

**Wood Grain Texture (CSS-Based)**:
```css
:root {
  --texture-wood-grain:
    /* Primary grain pattern */
    linear-gradient(
      45deg,
      transparent 25%,
      rgba(0,0,0,0.05) 26%,
      rgba(0,0,0,0.05) 27%,
      transparent 27%,
      transparent 74%,
      rgba(0,0,0,0.05) 75%,
      rgba(0,0,0,0.05) 76%,
      transparent 77%
    ),
    /* Secondary grain variation */
    linear-gradient(
      47deg,
      transparent 40%,
      rgba(0,0,0,0.02) 41%,
      transparent 42%
    );
}
```

**Metal Brushed Texture (CSS-Based)**:
```css
:root {
  --texture-metal-brushed:
    /* Primary brush lines */
    repeating-linear-gradient(
      90deg,
      transparent 0px,
      transparent 1px,
      rgba(0,0,0,0.03) 1px,
      rgba(0,0,0,0.03) 2px,
      transparent 2px,
      transparent 4px
    ),
    /* Surface variation */
    linear-gradient(
      90deg,
      rgba(255,255,255,0.1) 0%,
      transparent 50%,
      rgba(0,0,0,0.05) 100%
    );
}
```

### 2.10 Quality Validation Framework

#### 2.10.1 Automated Material Validation Tests

**Material Authenticity Validation**:
- CSS property validation for required material properties
- Texture pattern presence verification
- Color value range validation (authentic material colors only)
- Interaction state completeness checking

**Performance Validation Tests**:
- Gradient count per element (maximum 3)
- Transform usage validation (hardware acceleration)
- Animation frame rate monitoring (60fps requirement)
- Memory usage tracking per component

**Accessibility Integration Tests**:
- Contrast ratio validation on all material combinations
- Focus indicator visibility testing
- Reduced motion preference compliance
- High contrast mode functionality preservation

#### 2.10.2 Manual Quality Assurance Checklist

**Material Believability Assessment**:
- [ ] Each material passes "real-world recognition" test
- [ ] Material combinations feel naturally compatible
- [ ] Lighting direction consistency across all elements
- [ ] Material wear patterns follow realistic usage

**Interaction Quality Assessment**:
- [ ] All clickable elements provide immediate visual feedback
- [ ] Material physics feel responsive and appropriate
- [ ] Interactive affordances clearly indicated through material cues
- [ ] Disabled states communicate unavailability through realistic material aging

**Cross-Theme Consistency Assessment**:
- [ ] Material authenticity maintained across all 9 themes
- [ ] Relative material contrast relationships preserved
- [ ] Interactive states remain distinguishable in all lighting conditions
- [ ] Accessibility standards met in all theme combinations

## 3a. Design System Usage Rules — Quick Reference

> **Scope**: Decision matrices and enforcement checklists for daily component work. For detailed application guidelines, screen layout rules, and validation procedures, see §8.

### 3.1 Universal Application Rules

#### 3.1.1 Material Selection Decision Matrix

**Primary Material Assignment Rules** (Must Follow for All Components):

1. **Content Priority Hierarchy**:
   - **Wood (Primary Actions)**: Use only for the single most important action per screen/section
   - **Metal (Secondary Controls)**: Use for all secondary actions and system controls
   - **Paper (Content Display)**: Use for all reading surfaces and information display
   - **Glass (Temporary Overlays)**: Use only for modal content and temporary interfaces
   - **Fabric (Background Texture)**: Use only for section backgrounds and ambient textures

2. **Screen-Level Material Distribution Enforcement**:
   ```
   Per Screen/View Material Budget:
   - Wood elements: Maximum 1-2 primary actions
   - Metal elements: 3-8 secondary controls and frames
   - Paper elements: Unlimited for content areas
   - Glass elements: Maximum 1 active overlay at a time
   - Fabric elements: Background textures only, maximum 3 distinct areas
   ```

3. **Component-Level Material Hierarchy**:
   ```
   Button Component Hierarchy:
   Primary Action (Wood) > Secondary Action (Metal) > Tertiary (Paper with Metal Frame)

   Card Component Hierarchy:
   Critical Information (Paper + Wood Accent) > Standard Information (Paper) > Secondary Information (Paper + Metal Frame)

   Navigation Component Hierarchy:
   Active Navigation (Wood Highlight + Metal Base) > Inactive Navigation (Metal) > Section Headers (Paper on Metal)
   ```

#### 3.1.2 Consistent Interaction Pattern Rules

**Universal Hover State Requirements** (Apply to All Interactive Elements):

1. **Material-Specific Hover Enhancements**:
   - **Wood**: 10% brightness increase + enhanced grain visibility + subtle lift (1px)
   - **Metal**: Reflection enhancement + surface warming effect + edge highlighting
   - **Paper**: Shadow deepening + subtle texture emphasis + slight elevation
   - **Glass**: Edge brightness increase + surface flash effect
   - **Fabric**: Minimal texture emphasis only (background elements)

2. **Hover Timing Standards**:
   - **Entry Animation**: Must begin within 100ms of pointer entry
   - **Exit Animation**: Must complete within 200ms of pointer exit
   - **Material Physics**: Follow material-specific timing functions (defined in Section 2.1.1)

3. **Cross-Component Hover Consistency**:
   - All components of same material type must use identical hover enhancement patterns
   - Hover effects must respect material authenticity (no unrealistic transformations)
   - Hover intensity must scale appropriately with component importance

**Universal Active/Pressed State Requirements**:

1. **Material Compression Standards**:
   - **Wood**: 2px downward movement with shadow reduction
   - **Metal**: 1px downward movement with surface darkening
   - **Paper**: 0.5px downward movement with slight crease effect
   - **Glass**: Surface flash only (no physical compression)
   - **Fabric**: 3px soft compression with texture deformation

2. **Active State Feedback Timing**:
   - **Immediate Response**: Visual change must occur within 50ms of interaction
   - **Recovery Time**: Return to rest state within 200ms of interaction end
   - **Spring Effect**: Use appropriate easing for material recovery (cubic-bezier curves defined per material)

#### 3.1.3 Focus State Consistency Rules

**Material-Aware Focus Indicators** (Keyboard Navigation):

1. **Focus Ring Specifications**:
   - **Wood Elements**: 3px warm orange glow (#FF8C00 at 60% opacity)
   - **Metal Elements**: 3px cool blue glow (#4A90E2 at 70% opacity)
   - **Paper Elements**: 2px neutral gray outline (#666666 at 50% opacity)
   - **Glass Elements**: 3px bright white glow (#FFFFFF at 80% opacity)

2. **Focus Visibility Requirements**:
   - Must maintain 3:1 contrast ratio with background in all themes
   - Must remain visible during all interaction states
   - Must not interfere with material authenticity
   - Must include subtle pulse animation (2-3 second cycle)

3. **Focus Navigation Hierarchy**:
   - Tab order must follow visual material hierarchy (Wood → Metal → Paper)
   - Focus indicators must be consistent within material groups
   - Skip links must maintain material consistency with target elements

### 3.2 Screen-Specific Application Guidelines

#### 3.2.1 Main Application Screen Rules

**Layout Structure Requirements**:

1. **Background Material Hierarchy**:
   - **Application Background**: Fabric texture (linen weave pattern) at minimal opacity
   - **Main Content Area**: Paper surface with appropriate elevation (Level 2)
   - **Sidebar Navigation**: Metal panel with brushed texture
   - **Header/Toolbar**: Metal frame with integrated wood accent for primary actions

2. **Component Placement Rules**:
   - **Primary CTA**: Single wood button in header or main action area
   - **Secondary Actions**: Metal buttons in toolbar or action panels
   - **Content Cards**: Paper surface with metal frame accents for interactive elements
   - **Navigation Elements**: Metal base with wood highlights for active states

3. **Visual Flow Enforcement**:
   - Users' eyes should be drawn to wood elements first (primary actions)
   - Metal elements provide clear navigation and secondary actions
   - Paper content areas maintain comfortable reading experience
   - Glass overlays appear only when summoned by user action

#### 3.2.2 Modal/Dialog Screen Rules

**Overlay Material Requirements**:

1. **Modal Structure Standards**:
   - **Backdrop**: Fabric texture with 75% opacity overlay for depth
   - **Modal Container**: Glass material with realistic edge highlighting
   - **Modal Content**: Paper surface with appropriate shadow depth
   - **Action Buttons**: Wood (primary) and Metal (secondary) with proper hierarchy

2. **Interaction Flow Rules**:
   - Modal appearance: Glass material slides in with backdrop blur
   - Content loading: Paper surface appears with subtle lift animation
   - Action hierarchy: Wood action visually dominant, Metal action clearly secondary
   - Dismissal: Reverse animation maintaining material physics

3. **Layering Consistency**:
   - Background content reduced to 60% visibility through fabric overlay
   - Modal glass container at elevation level 6 minimum
   - Modal content paper at elevation level 8 for clear hierarchy
   - Focus trapped within modal with appropriate material focus indicators

#### 3.2.3 Form Screen Rules

**Form Component Material Standards**:

1. **Input Field Structure**:
   - **Field Container**: Metal frame with realistic inset depth
   - **Input Surface**: Paper texture for content entry area
   - **Labels**: Typography that appears printed/etched on appropriate material
   - **Validation Feedback**: Material-appropriate error/success indicators

2. **Form Layout Hierarchy**:
   - **Primary Submit Action**: Wood button with prominent placement
   - **Secondary Actions**: Metal buttons with clear visual separation
   - **Field Groupings**: Paper cards with metal frame organization
   - **Help Text**: Paper surface typography with appropriate contrast

3. **Error State Material Integration**:
   - **Field Errors**: Warm error color applied to metal frame (not replacing material)
   - **Success States**: Cool success color integrated into material appearance
   - **Warning States**: Yellow accent integrated without breaking material authenticity
   - **Disabled States**: Material wear/aging patterns rather than flat opacity changes

### 3.3 Component Consistency Enforcement Rules

#### 3.3.1 Button Component Usage Rules

**Primary Button (Wood Material) Usage**:
1. **Maximum per Screen**: One primary button per major section or screen
2. **Placement Requirements**: Must be visually prominent, typically top-right or bottom-right
3. **Content Restrictions**: Action text must be clear, concise, and action-oriented
4. **Visual Consistency**: All primary buttons must use identical wood material properties

**Secondary Button (Metal Material) Usage**:
1. **Grouping Rules**: Multiple secondary buttons may appear together in toolbars or action groups
2. **Hierarchy Maintenance**: Must visually support, not compete with, primary wood buttons
3. **Interaction Consistency**: All metal buttons must share identical hover/active states
4. **Accessibility Requirements**: Must maintain 7:1 contrast ratio for normal text in all themes (WCAG AAA); 4.5:1 for large text; 4.5:1 AA floor for glass/overlay surfaces

#### 3.3.2 Card Component Usage Rules

**Content Card (Paper Material) Standards**:
1. **Content Hierarchy**: Most important content on highest elevation paper cards
2. **Interactive Cards**: Subtle hover effects appropriate for paper material
3. **Selection States**: Paper lifting effect with enhanced shadow depth
4. **Content Overflow**: Realistic paper scroll/fold effects for long content

**Card Action Elements**:
1. **Embedded Actions**: Use metal micro-buttons for secondary actions within paper cards
2. **Primary Card Actions**: Wood accent elements (borders, corner treatments) for primary interactions
3. **Status Indicators**: Metal badges or wood burned text depending on importance
4. **Progress Elements**: Material-appropriate progress representations (metal bars, paper fill)

#### 3.3.3 Navigation Component Usage Rules

**Sidebar Navigation Standards**:
1. **Background Material**: Consistent metal panel with horizontal brushing pattern
2. **Navigation Items**: Metal base with wood highlight strips for active states
3. **Icon Treatment**: Etched metal appearance with appropriate depth
4. **Grouping Elements**: Subtle metal divider lines with realistic depth

**Tab Navigation Standards**:
1. **Tab Material**: Metal panels with wood inlay for active tab
2. **Tab Switching**: Realistic material transition animations
3. **Tab Hierarchy**: Active tab elevated above inactive tabs
4. **Content Association**: Clear material relationship between tab and content area

### 3.4 Theme Adaptation Rules

#### 3.4.1 Cross-Theme Material Consistency

**Material Color Adaptation Standards**:
1. **Wood Materials**: Maintain wood species authenticity across all themes (walnut remains walnut-toned)
2. **Metal Materials**: Adapt metal type appropriately (bright steel for light themes, dark steel for dark themes)
3. **Paper Materials**: Adjust paper tone while maintaining fiber texture visibility
4. **Glass Materials**: Subtle tinting only, preserve transparency and clarity
5. **Fabric Materials**: Natural textile color variations only

**Lighting Direction Consistency**:
1. **Universal Light Source**: 135° angle maintained across all themes
2. **Shadow Direction**: Consistent 315° shadow casting in all themes
3. **Highlight Intensity**: Scaled appropriately for theme brightness while maintaining material authenticity
4. **Ambient Lighting**: Adjusted for theme context (natural daylight vs evening warmth)

#### 3.4.2 Theme-Specific Usage Guidelines

**Light Theme Application Rules**:
- **Wood**: Lighter stains with prominent grain visibility
- **Metal**: Bright brushed steel with clear highlights
- **Paper**: Warm cream tones with visible fiber texture
- **Glass**: Crystal clear with bright edge highlights
- **Fabric**: Natural linen with visible weave structure

**Dark Theme Application Rules**:
- **Wood**: Darker stains with subdued but visible grain
- **Metal**: Darker metals (gunmetal) with reduced highlights
- **Paper**: Darker paper stocks maintaining readability
- **Glass**: Subtle gray tinting while preserving functionality
- **Fabric**: Darker textile tones with preserved texture

### 3.5 Accessibility Integration Rules

#### 3.5.1 High Contrast Mode Adaptations

**Material Simplification Requirements**:
1. **Texture Reduction**: Complex material textures simplified to essential contrast elements
2. **Depth Indication**: Material depth conveyed through border and background color changes
3. **Interactive States**: Material effects replaced with high-contrast alternatives
4. **Focus Indicators**: Enhanced visibility without relying on subtle material effects

#### 3.5.2 Reduced Motion Accessibility

**Material Physics Alternatives**:
1. **Animation Replacement**: Material compression effects replaced with color/border changes
2. **Elevation Changes**: Immediate shadow/border updates instead of smooth transitions
3. **Hover Effects**: Instant color changes instead of gradual material enhancement
4. **Loading States**: Static material indicators instead of animated textures

#### 3.5.3 Screen Reader Integration

**Material Context Communication**:
1. **ARIA Labels**: Include material metaphors where helpful for context ("wooden submit button", "paper content card")
2. **State Communication**: Describe material changes that convey interaction states
3. **Navigation Aids**: Use material hierarchy to reinforce logical navigation structure
4. **Content Relationships**: Material groupings support logical content relationships

### 3.6 Quality Control and Validation Rules

#### 3.6.1 Pre-Implementation Checklist

**Material Selection Validation**:
- [ ] Component's screen follows its per-screen material distribution target (see Screen Mapping table; defaults to 60/25/10/4/1 ±5% for unlisted screens)
- [ ] Material choice appropriate for component function and importance
- [ ] No more than 3 different materials used in single component
- [ ] Material combinations feel naturally compatible
- [ ] Lighting direction consistent with unified light source

**Interaction Pattern Validation**:
- [ ] All interactive states defined and implemented consistently
- [ ] Material physics appropriate for each material type
- [ ] Timing functions follow material-specific curves
- [ ] Accessibility alternatives provided for all material effects
- [ ] Cross-theme compatibility verified for all states

#### 3.6.2 Post-Implementation Testing

**Material Authenticity Testing**:
1. **Visual Recognition Test**: Users should immediately recognize intended materials
2. **Physical Behavior Test**: Interactions should feel appropriate for material type
3. **Consistency Test**: Similar components behave identically across application
4. **Theme Adaptation Test**: Materials remain authentic across all 9 themes

**Performance Impact Testing**:
1. **Rendering Performance**: Smooth 60fps animations on target hardware
2. **Memory Usage**: Material effects don't significantly impact application memory
3. **Initial Load Time**: Material system doesn't delay application startup
4. **Mobile Performance**: Appropriate fallbacks for lower-powered devices

**Accessibility Compliance Testing**:
1. **Contrast Validation**: All material combinations meet WCAG AAA standards (7:1 normal text, 4.5:1 large text ≥18pt/14pt bold). Glass/overlay surfaces: AA (4.5:1 normal, 3:1 large) is the documented floor — each exception requires rationale. All automated tests run at AAA thresholds first.
2. **Keyboard Navigation**: Focus indicators work naturally with material surfaces
3. **Screen Reader Testing**: Material metaphors enhance rather than hinder accessibility
4. **Reduced Motion Testing**: Alternative feedback methods function correctly

### 3.7 Implementation Maintenance Rules

#### 3.7.1 Design Token Management

**Token Usage Consistency**:
1. **Material Properties**: Always use defined material tokens, never hardcode values
2. **Color Authenticity**: Material colors must stay within authentic ranges
3. **Texture Patterns**: Use standardized texture definitions for consistency
4. **Timing Functions**: Apply material-specific timing for all animations

**Token Evolution Guidelines**:
1. **Backward Compatibility**: Changes to material tokens must not break existing implementations
2. **Cross-Component Impact**: Token changes must be evaluated across entire application
3. **Theme Consistency**: Token updates must work across all 9 color themes
4. **Performance Consideration**: Token complexity must respect performance constraints

#### 3.7.2 Component Library Maintenance

**Material Consistency Enforcement**:
1. **New Component Requirements**: All new components must follow established material patterns
2. **Existing Component Updates**: Changes must maintain material authenticity and consistency
3. **Interaction Pattern Reuse**: Use established interaction patterns rather than creating new variations
4. **Documentation Updates**: Material usage must be documented for future development

**Quality Assurance Integration**:
1. **Automated Testing**: Material property validation integrated into build process
2. **Visual Regression Testing**: Screenshots comparison to catch material consistency issues
3. **Cross-Browser Testing**: Material rendering validated across supported browsers
4. **Performance Monitoring**: Material system performance tracked in production environment

## 8. Design System Usage Rules & Application Guidelines

> **Scope**: Comprehensive application rules, screen layout standards, theme integrity, and validation procedures. For quick-reference decision matrices, see §3a.

### 8.1 Material Selection Guidelines

#### 8.1.1 Component Material Assignment Rules

**Primary Action Elements**:
- **Rule**: All primary actions (main CTAs, submit buttons, save actions) MUST use wood material
- **Implementation**: Apply `.material-wood` with appropriate button state classes
- **Validation**: Primary actions should feel substantial and trustworthy like quality wood furniture

**Secondary Control Elements**:
- **Rule**: Secondary controls (toggles, tabs, control panels) MUST use metal material
- **Implementation**: Apply `.material-metal` with brushed texture patterns
- **Validation**: Controls should feel precise and responsive like quality metal instruments

**Content Container Elements**:
- **Rule**: All content surfaces (cards, panels, document areas) MUST use paper material
- **Implementation**: Apply `.material-paper` with subtle fiber textures
- **Validation**: Content areas should feel like quality paper with appropriate weight and texture

**Overlay Elements**:
- **Rule**: All modal dialogs, popups, and overlays MUST use glass material
- **Implementation**: Apply `.material-glass` with transparency and refraction effects
- **Validation**: Overlays should feel like they're floating above the interface with realistic glass properties

**Background Elements**:
- **Rule**: Background textures and ambient surfaces MUST use fabric material
- **Implementation**: Apply `.material-fabric` sparingly (maximum 1% of interface)
- **Validation**: Backgrounds should provide subtle texture without overwhelming content

#### 8.1.2 Material Distribution Enforcement

**60/25/10/4/1 Distribution Rule** (design-intent baseline for new screens only — per-screen targets in §Screen Mapping are the authoritative source of truth):
- **Paper (60%)**: All content surfaces, cards, document areas, main reading spaces
- **Metal (25%)**: Secondary controls, tool panels, input frames, navigation structure
- **Wood (10%)**: Primary buttons, CTAs, active navigation highlights, confirm actions
- **Glass (4%)**: Modal overlays, popup dialogs, temporary information panels
- **Fabric (1%)**: Background textures, decorative accents only

> **⚠️ Per-screen targets override the global baseline.** See "Material Distribution Governance" in the Visual Architecture Decisions section for the complete per-screen target table, tolerances, and exception rationale. See **§8.1.3** for the measurement methodology (viewport set, area computation, transient UI handling, pass/fail thresholds).

#### 8.1.3 Material Distribution Validation Specification

> **⚠️ MEASUREMENT METHODOLOGY** — Defines exactly how material percentages are computed, when they are measured, and what passes/fails. Without this, visual consistency checks are non-reproducible.

**What is measured**:
- Material distribution is measured as the **percentage of visible surface area** (in CSS pixels²) covered by each material class (`.material-paper-*`, `.material-metal-*`, `.material-wood-*`, `.material-glass-*`, `.material-fabric-*`).
- Only DOM elements with explicit `material-*` class assignments are counted. Unclassified elements (e.g., bare `<div>` with no material class) are excluded from the denominator — they do not inflate or deflate any material's percentage.

**How percentages are computed**:
1. For each screen, the validator computes `boundingClientRect.width × boundingClientRect.height` for every element with a `material-*` class.
2. Elements are deduplicated: if a child and parent both have material classes, only the child's area counts (innermost material wins for overlapping regions).
3. Total material area = sum of all material element areas. Each material's percentage = (sum of that material's element areas / total material area) × 100.
4. For overlapping elements (e.g., a glass modal over a paper surface), only the **topmost visible material** counts. The occluded region of the underlying material is subtracted.

**When it is measured (viewport set)**:
| Viewport | Width × Height | Purpose |
|----------|---------------|---------|
| Desktop (primary) | 1440 × 900 | Primary validation target |
| Desktop (wide) | 1920 × 1080 | Responsive validation |
| Laptop | 1280 × 800 | Compact layout validation |

- Measurements are taken at each viewport size. Per-screen targets must pass at **all three viewports**.

**Transient UI handling**:
- **Modals/Dialogs**: Measured separately when open. The modal's material distribution is validated against the "Modal / Dialog" row in the Screen Mapping table, NOT the underlying screen's row.
- **Toasts/Popovers**: Excluded from material distribution measurement (transient, <5% of viewport, <3s visible duration).
- **Dropdown menus**: Excluded from distribution measurement (transient). Their material class is validated for consistency only (must be glass or paper per the component spec).
- **Tooltips**: Excluded entirely (ephemeral, <2% viewport).

**Pass/fail thresholds**:
- A screen passes if every material percentage is within ±5% of its per-screen target (from the Screen Mapping table).
- If any material exceeds ±5%, the build-time report emits a **warning** (not a build error) with the screen name, material, expected %, actual %, and delta.
- If any material exceeds ±10%, the build-time report emits a **hard error** and blocks the build.

**Automation**:
```typescript
// scripts/validate-material-distribution.ts
interface ScreenMaterialTarget {
  screen: string;
  targets: { paper: number; metal: number; wood: number; glass: number; fabric: number };
  tolerance: number; // ±percentage points (default: 5)
  hardErrorThreshold: number; // ±percentage points (default: 10)
}

// Puppeteer/Playwright script runs headless at each viewport size,
// queries all [class*="material-"] elements, computes area percentages,
// and compares against per-screen targets from the Screen Mapping table.
```

### 8.2 Interaction Consistency Rules

#### 8.2.1 Material Physics Compliance

**Wood Component Interactions**:
- **Hover Effect**: 2px subtle lift with warm shadow enhancement
- **Active Effect**: 1px compress with darker shadow, 150ms timing
- **Focus Effect**: Warm wooden highlight border, no material physics change
- **Disabled Effect**: Weathered wood appearance with reduced saturation

**Metal Component Interactions**:
- **Hover Effect**: Highlight polish with increased reflection, 100ms timing
- **Active Effect**: Immediate tactile response, metallic resonance visual
- **Focus Effect**: Sharp metallic outline following component edges
- **Disabled Effect**: Tarnished appearance with reduced reflectivity

**Paper Component Interactions**:
- **Hover Effect**: Gentle shadow darkening, minimal movement
- **Active Effect**: Slight indent with fiber compression visual
- **Focus Effect**: Soft paper texture highlight, preserve paper weight feel
- **Disabled Effect**: Yellowed or aged paper appearance

**Glass Component Interactions**:
- **Hover Effect**: Increased clarity and sharpened refraction
- **Active Effect**: Ripple effect from interaction point, glass physics
- **Focus Effect**: Clean glass edge highlight with refraction
- **Disabled Effect**: Frosted glass appearance with reduced transparency

**Fabric Component Interactions**:
- **Hover Effect**: Subtle texture enhancement, no movement
- **Active Effect**: Gentle compression following fabric weave
- **Focus Effect**: Woven pattern emphasis without material change
- **Disabled Effect**: Faded fabric with reduced texture definition

#### 8.2.2 Cross-Component Interaction Rules

**Material Transition Standards**:
- **Rule**: When transitioning between materials, maintain realistic physics boundaries
- **Implementation**: No morphing between materials; use layering or replacement
- **Example**: Paper card opening to glass modal - paper slides behind glass, doesn't transform

**Interaction Hierarchy**:
1. **Glass overlays** always appear above all other materials
2. **Wood components** have highest tactile priority for primary actions
3. **Metal controls** provide precise feedback for secondary interactions
4. **Paper surfaces** remain stable during interactions
5. **Fabric backgrounds** never interfere with foreground interactions

### 8.3 Screen Layout Application Rules

#### 8.3.1 Page Structure Standards

**Application Shell Structure** (Mandatory):
```html
<!-- Standard page structure -->
<div class="app-shell material-fabric"> <!-- Background: fabric -->
  <header class="app-header material-wood"> <!-- Header: wood -->
    <!-- Navigation components use wood material -->
  </header>

  <main class="app-content material-paper"> <!-- Content: paper -->
    <!-- All content containers use paper material -->
    <section class="content-section material-paper">
      <!-- Individual cards and panels use paper -->
    </section>
  </main>

  <aside class="app-sidebar material-metal"> <!-- Sidebar: metal -->
    <!-- Control panels and tools use metal material -->
  </aside>
</div>

<!-- Overlays always use glass -->
<div class="modal-overlay material-glass">
  <!-- Modal content maintains paper material inside glass -->
  <div class="modal-content material-paper">
    <!-- Actions inside modals still follow wood/metal rules -->
  </div>
</div>
```

**Material Nesting Rules**:
- **Glass can contain**: Any material (overlays contain everything)
- **Wood can contain**: Metal controls, paper content (navigation with controls/content)
- **Paper can contain**: All materials except glass (content areas with embedded controls)
- **Metal can contain**: Paper displays only (control panels with status displays)
- **Fabric contains nothing**: Background texture only, no nested components

#### 8.3.2 Responsive Behavior Rules

**Material Preservation Across Breakpoints**:
- **Desktop (>1200px)**: Full material system with all textures and effects
- **Tablet (768-1200px)**: Simplified textures, maintain material physics
- **Mobile (<768px)**: Essential material identity only, performance-optimized

**Material Simplification Rules**:
```css
/* Progressive enhancement for material complexity */
@media (max-width: 768px) {
  .material-wood { --wood-grain-complexity: simple; }
  .material-metal { --metal-reflection-quality: basic; }
  .material-paper { --paper-fiber-detail: minimal; }
  .material-glass { --glass-refraction-layers: 1; }
  .material-fabric { --fabric-weave-visibility: none; }
}

@media (prefers-reduced-motion: reduce) {
  .material-base { --material-physics-enabled: false; }
}
```

### 8.4 Theme Consistency Rules

#### 8.4.1 Cross-Theme Material Integrity

**Material Color Adaptation Rules**:
- **Wood**: Maintain grain visibility across all themes, adjust tone not texture
- **Metal**: Preserve reflective properties, adapt reflection color to theme
- **Paper**: Keep fiber structure, vary base color within paper color ranges
- **Glass**: Adjust transparency tint, maintain refraction properties
- **Fabric**: Preserve weave pattern, adapt thread colors to theme palette

**Theme Transition Standards**:
```css
/* Theme switching must preserve material physics */
.material-base {
  transition:
    color 0.3s ease-out,
    background-color 0.3s ease-out,
    border-color 0.3s ease-out;
  /* Never transition material-specific properties like texture or physics */
}

/* Material-specific properties remain constant */
.material-wood {
  --wood-grain-pattern: url(data:image/svg+xml;base64,...); /* Never changes */
}
.material-metal {
  --metal-brush-direction: 45deg; /* Never changes */
}
```

#### 8.4.2 Accessibility Compliance Across Themes

**High Contrast Mode Adaptations**:
- **Rule**: All materials must provide high contrast alternatives that maintain material identity
- **Implementation**: Use `@media (prefers-contrast: high)` to provide simplified but recognizable materials
- **Validation**: Materials should remain distinguishable in high contrast mode

**Color Blindness Considerations**:
- **Rule**: Material identity cannot depend solely on color
- **Implementation**: Texture patterns and physical properties must distinguish materials
- **Validation**: Materials must be identifiable in grayscale preview

### 8.5 Component Development Guidelines

#### 8.5.1 New Component Creation Rules

**Material Assignment Process**:
1. **Identify Component Function**: Determine if component is primary action, secondary control, content display, overlay, or background
2. **Apply Material Logic**: Use material assignment rules (Section 8.1.1)
3. **Validate Distribution**: Ensure new component doesn't break the screen's per-screen material target (Screen Mapping table; 60/25/10/4/1 baseline for unlisted screens only)
4. **Implement Interactions**: Apply appropriate material physics from interaction rules
5. **Test Across Themes**: Verify material integrity across all 9 themes

**Component Class Structure** (Mandatory):
```css
/* All new components must follow this pattern */
.new-component {
  /* 1. Apply base material class */
  @extend .material-base;
  @extend .material-[type]; /* wood, metal, paper, glass, or fabric */

  /* 2. Apply component-specific properties */
  /* Component layout and positioning */

  /* 3. Apply interaction patterns */
  @extend .material-interactive; /* If component is interactive */

  /* 4. Theme adaptations */
  /* Theme-specific adjustments that preserve material identity */
}
```

#### 8.5.2 Component Modification Guidelines

**Existing Component Updates**:
- **Rule**: Material changes require design system team approval
- **Process**: Document material rationale before implementation
- **Validation**: Updated components must pass material authenticity tests

**Breaking Change Prevention**:
- **Material Class Stability**: Never modify core material classes without versioning
- **Backward Compatibility**: New material variants must not break existing implementations
- **Documentation Updates**: All material changes require usage rule documentation updates

### 8.6 Quality Validation & Enforcement

#### 8.6.1 Automated Validation Rules

**Build-Time Material Validation**:
```javascript
// Material distribution validator — validates against PER-SCREEN targets (not global baseline).
// See §8.1.3 for the complete measurement methodology (area computation, viewport set, transient UI handling).

// Per-screen targets from the Screen Mapping table (canonical source of truth)
const SCREEN_TARGETS = {
  'dashboard':     { paper: 55, metal: 28, wood: 12, glass: 0,  fabric: 5 },
  'kanban':        { paper: 58, metal: 18, wood: 8,  glass: 0,  fabric: 16 },
  'modal':         { paper: 50, metal: 15, wood: 10, glass: 25, fabric: 0 },
  'settings':      { paper: 60, metal: 28, wood: 8,  glass: 0,  fabric: 4 },
  'chat':          { paper: 72, metal: 16, wood: 8,  glass: 0,  fabric: 4 },
  'terminal':      { paper: 45, metal: 42, wood: 3,  glass: 0,  fabric: 10 },
  'file-explorer': { paper: 62, metal: 25, wood: 8,  glass: 0,  fabric: 5 },
  'search':        { paper: 35, metal: 15, wood: 5,  glass: 40, fabric: 5 },
  'insights':      { paper: 65, metal: 22, wood: 8,  glass: 0,  fabric: 5 },
};
// Fallback for unlisted screens: 60/25/10/4/1 global baseline
const DEFAULT_TARGET = { paper: 60, metal: 25, wood: 10, glass: 4, fabric: 1 };
const TOLERANCE = 5;       // ±5% = warning
const HARD_ERROR = 10;     // ±10% = build error

function validateMaterialDistribution(dom, screenId) {
  const targets = SCREEN_TARGETS[screenId] || DEFAULT_TARGET;
  const materialCounts = {
    paper: dom.querySelectorAll('.material-paper').length,
    wood: dom.querySelectorAll('.material-wood').length,
    metal: dom.querySelectorAll('.material-metal').length,
    glass: dom.querySelectorAll('.material-glass').length,
    fabric: dom.querySelectorAll('.material-fabric').length
  };

  const total = Object.values(materialCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return { isValid: true, percentages: {}, violations: [] };

  const percentages = {
    paper: (materialCounts.paper / total) * 100,
    wood: (materialCounts.wood / total) * 100,
    metal: (materialCounts.metal / total) * 100,
    glass: (materialCounts.glass / total) * 100,
    fabric: (materialCounts.fabric / total) * 100
  };

  // Validate against per-screen target (±TOLERANCE = warning, ±HARD_ERROR = build error)
  const violations = [];
  for (const [material, target] of Object.entries(targets)) {
    const actual = percentages[material];
    const delta = Math.abs(actual - target);
    if (delta > HARD_ERROR) {
      violations.push({ material, target, actual, delta, severity: 'error' });
    } else if (delta > TOLERANCE) {
      violations.push({ material, target, actual, delta, severity: 'warning' });
    }
  }

  const hasErrors = violations.some(v => v.severity === 'error');
  return { isValid: !hasErrors, percentages, violations, screenId };
}
```

**Material Physics Validation**:
```css
/* CSS validation for material physics compliance */
@supports (selector(::before)) {
  .material-wood:not([data-physics-compliant]) {
    border: 2px solid red !important;
    &::after {
      content: "Wood physics not compliant";
      position: absolute;
      background: red;
      color: white;
      font-size: 10px;
      z-index: 9999;
    }
  }
}
```

#### 8.6.2 Manual Review Checklist

**Screen-Level Validation**:
- [ ] **Material Distribution**: Page follows its per-screen target (Screen Mapping table) within ±5% tolerance; defaults to 60/25/10/4/1 for unlisted screens. Measurement per §8.1.3.
- [ ] **Material Logic**: Each component uses appropriate material for its function
- [ ] **Interaction Consistency**: All interactions follow material physics rules
- [ ] **Theme Integrity**: Materials maintain authenticity across all themes
- [ ] **Performance Impact**: Page renders within performance budgets with full materials
- [ ] **Accessibility Compliance**: Materials work in high contrast and reduced motion modes

**Component-Level Validation**:
- [ ] **Material Identity**: Component clearly represents chosen real-world material
- [ ] **Physical Properties**: Component behaves according to material physics
- [ ] **State Transitions**: All interactive states follow material-appropriate changes
- [ ] **Cross-Theme Consistency**: Component maintains material identity across themes
- [ ] **Performance Optimization**: Material effects don't cause rendering bottlenecks

### 8.7 Documentation & Training Requirements

#### 8.7.1 Developer Documentation Standards

**Material Usage Documentation** (Required for all components):
```typescript
/**
 * Component: TaskCard
 * Material: Paper (content display surface)
 * Rationale: Cards represent document/content surfaces requiring paper material
 * Physics: Gentle hover lift (2px), subtle shadow enhancement
 * Interactions: Paper-appropriate focus states, aging for disabled state
 * Theme Behavior: Maintains paper fiber texture across all themes
 * Accessibility: High contrast mode uses simplified paper texture
 * Performance: Uses optimized paper fiber CSS pattern (no images)
 */
export const TaskCard: React.FC<TaskCardProps> = ({ ... }) => {
  return (
    <div className="task-card material-paper material-interactive">
      {/* Component implementation */}
    </div>
  );
};
```

**Material Decision Documentation**:
- **Required Fields**: Component name, chosen material, selection rationale, interaction behavior
- **Review Process**: Material decisions require design system team review for consistency
- **Update Protocol**: Material changes require documentation updates and team notification

#### 8.7.2 Design System Training Guidelines

**Material System Understanding Requirements**:
1. **Material Properties**: Developers must understand physical properties of each material
2. **Interaction Physics**: Understanding of how each material responds to user interactions
3. **Performance Implications**: Knowledge of rendering costs for different material effects
4. **Accessibility Integration**: Understanding of how materials adapt for accessibility needs
5. **Cross-Theme Behavior**: Knowledge of how materials adapt while maintaining identity

**Quality Assurance Training**:
1. **Material Authenticity Testing**: How to validate that materials look and behave realistically
2. **Distribution Validation**: Methods for checking material distribution compliance
3. **Performance Testing**: Tools and techniques for material performance validation
4. **Cross-Browser Testing**: Ensuring material consistency across different browsers
5. **Accessibility Testing**: Validating material accessibility across different user needs

## 9. Critical Gaps Resolution & Implementation Enhancements

### 9.1 Comprehensive Implementation Timeline & Sprint Planning

#### 9.1.1 Detailed Sprint Breakdown (8-Week Implementation)

**Sprint 1-2: Foundation & Infrastructure (Weeks 1-2)**

*Week 1 Deliverables:*
- [ ] **Day 1-2**: CSS custom property system implementation
  - Files: `.design-system/tokens/materials.css`, `.design-system/tokens/lighting.css`
  - Dependencies: None
  - Validation: Material token accessibility and performance testing

- [ ] **Day 3-4**: Base material class system development
  - Files: `.design-system/components/material-base.css`
  - Dependencies: Material tokens completion
  - Validation: Cross-browser material rendering tests

- [ ] **Day 5**: Performance optimization infrastructure
  - Files: `src/utils/materialPerformance.ts`, `webpack.config.material.js`
  - Dependencies: Base material classes
  - Validation: Bundle size impact assessment

*Week 2 Deliverables:*
- [ ] **Day 1-2**: Theme integration system enhancement
  - Files: `src/context/ThemeContext.tsx`, `src/hooks/useMaterialTheme.ts`
  - Dependencies: Material base system
  - Validation: Theme switching performance and consistency testing

- [ ] **Day 3-4**: Accessibility compliance framework
  - Files: `src/utils/materialAccessibility.ts`, `.design-system/accessibility/`
  - Dependencies: Theme integration
  - Validation: High contrast and reduced motion compliance testing

- [ ] **Day 5**: Component migration utilities
  - Files: `scripts/migrateMaterialComponents.ts`, `src/utils/componentMigration.ts`
  - Dependencies: All foundation systems
  - Validation: Safe migration pathway testing

**Sprint 3-4: Core Component Migration (Weeks 3-4)**

*Week 3 Deliverables:*
- [ ] **Day 1-2**: Button component material implementation
  - Files: `src/components/ui/Button.tsx`, `.design-system/components/buttons.css`
  - Dependencies: Foundation infrastructure
  - Migration Strategy: Feature flag rollout, A/B testing capability
  - Validation: Cross-theme button consistency, interaction physics testing

- [ ] **Day 3-4**: Input and form component migration
  - Files: `src/components/ui/Input.tsx`, `src/components/ui/FormField.tsx`
  - Dependencies: Button completion
  - Migration Strategy: Progressive enhancement, fallback support
  - Validation: Form accessibility, material authenticity testing

- [ ] **Day 5**: Card and panel component implementation
  - Files: `src/components/ui/Card.tsx`, `src/components/ui/Panel.tsx`
  - Dependencies: Form components
  - Migration Strategy: Content area prioritization
  - Validation: Paper material consistency, elevation testing

*Week 4 Deliverables:*
- [ ] **Day 1-2**: Navigation component material integration
  - Files: `src/components/navigation/Sidebar.tsx`, `src/components/navigation/TabBar.tsx`
  - Dependencies: Core UI components
  - Migration Strategy: Navigation-first rollout for user familiarity
  - Validation: Navigation usability, material hierarchy testing

- [ ] **Day 3-4**: Modal and overlay system enhancement
  - Files: `src/components/ui/Modal.tsx`, `src/components/ui/Popover.tsx`
  - Dependencies: Navigation completion
  - Migration Strategy: Critical user flows prioritization
  - Validation: Glass material rendering, layering consistency testing

- [ ] **Day 5**: Integration testing and refinement
  - All component integration testing
  - Cross-component material consistency validation
  - Performance impact assessment and optimization

**Sprint 5-6: Advanced Components & Polish (Weeks 5-6)**

*Week 5 Deliverables:*
- [ ] **Day 1-2**: Data display component enhancement
  - Files: `src/components/ui/Table.tsx`, `src/components/ui/DataGrid.tsx`
  - Dependencies: Core component completion
  - Migration Strategy: Read-heavy screens prioritization
  - Validation: Large dataset rendering performance testing

- [ ] **Day 3-4**: Specialized component implementation
  - Files: `src/components/ui/DatePicker.tsx`, `src/components/ui/ColorPicker.tsx`
  - Dependencies: Data display components
  - Migration Strategy: Feature-specific rollout
  - Validation: Complex interaction material consistency testing

- [ ] **Day 5**: Micro-interaction and animation refinement
  - Files: `.design-system/animations/`, `src/hooks/useMaterialAnimations.ts`
  - Dependencies: All component implementations
  - Validation: Animation performance, accessibility compliance testing

*Week 6 Deliverables:*
- [ ] **Day 1-2**: Cross-theme consistency optimization
  - All theme-specific adjustments and refinements
  - Dependencies: Component implementation completion
  - Validation: Theme switching robustness testing

- [ ] **Day 3-4**: Performance optimization and monitoring
  - Bundle optimization, lazy loading, rendering performance
  - Dependencies: Theme consistency completion
  - Validation: Performance regression testing

- [ ] **Day 5**: Documentation completion and developer experience
  - Component documentation, style guide updates
  - Dependencies: Performance optimization
  - Validation: Developer onboarding effectiveness testing

**Sprint 7-8: Testing, Deployment & Monitoring (Weeks 7-8)**

*Week 7 Deliverables:*
- [ ] **Day 1-2**: Comprehensive cross-browser testing
  - Chrome, Firefox, Safari, Edge compatibility validation
  - Dependencies: All implementation completion
  - Validation: Browser-specific material rendering consistency

- [ ] **Day 3-4**: Accessibility comprehensive testing
  - Screen reader, keyboard navigation, high contrast testing
  - Dependencies: Browser testing completion
  - Validation: WCAG AAA compliance verification (7:1 normal text, 4.5:1 large text)

- [ ] **Day 5**: User acceptance testing preparation
  - Beta testing environment setup, user feedback collection system
  - Dependencies: Accessibility testing completion
  - Validation: User experience consistency across scenarios

*Week 8 Deliverables:*
- [ ] **Day 1-2**: Production deployment preparation
  - Feature flag system, gradual rollout strategy, rollback procedures
  - Dependencies: Testing completion
  - Validation: Deployment safety and rollback capability testing

- [ ] **Day 3-4**: Monitoring and analytics implementation
  - Material system performance monitoring, user interaction analytics
  - Dependencies: Deployment preparation
  - Validation: Monitoring coverage and alerting effectiveness

- [ ] **Day 5**: Go-live and post-launch support
  - Production release, monitoring activation, support documentation
  - Dependencies: All previous deliverables
  - Validation: Live system performance and user feedback monitoring

#### 9.1.2 Dependency Management & Risk Mitigation

**Critical Path Dependencies**:
1. **Foundation Infrastructure** → Core UI Components → Navigation Components → Advanced Components
2. **Theme System** → Accessibility Framework → Cross-Theme Testing
3. **Performance Infrastructure** → Component Optimization → Production Monitoring

**Risk Mitigation Strategies**:
- **Parallel Development**: Independent component teams working simultaneously on non-dependent components
- **Feature Flags**: Granular rollout control for each component and material system feature
- **Automated Testing**: CI/CD integration for material consistency and performance regression detection
- **Rollback Procedures**: Immediate fallback to current system for each component independently

### 9.2 Component Migration Strategy & Backward Compatibility

#### 9.2.1 Safe Migration Framework

**Component Migration Architecture**:
```typescript
// Safe migration wrapper system
interface ComponentMigrationConfig {
  enableMaterialDesign: boolean;
  fallbackToOriginal: boolean;
  performanceThreshold: number;
  accessibilityCompliant: boolean;
}

// Universal migration wrapper
export const withMaterialMigration = <P extends object>(
  OriginalComponent: React.ComponentType<P>,
  MaterialComponent: React.ComponentType<P>,
  config: ComponentMigrationConfig
) => {
  return (props: P) => {
    const { materialSystemEnabled, performanceMode } = useMaterialSystem();
    const shouldUseMaterial =
      config.enableMaterialDesign &&
      materialSystemEnabled &&
      performanceMode !== 'low';

    return shouldUseMaterial ?
      <MaterialComponent {...props} /> :
      <OriginalComponent {...props} />;
  };
};

// Migration status tracking
export const useMigrationTracking = (componentName: string) => {
  const trackMigration = useCallback((status: 'started' | 'completed' | 'failed') => {
    analytics.track('material_migration', {
      component: componentName,
      status,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      performanceMode: getPerformanceMode()
    });
  }, [componentName]);

  return { trackMigration };
};
```

**Incremental Migration Strategy**:
1. **Phase 1**: Implement material components alongside existing components
2. **Phase 2**: Progressive A/B testing with user cohorts
3. **Phase 3**: Gradual rollout based on user feedback and performance metrics
4. **Phase 4**: Complete migration with fallback support maintained
5. **Phase 5**: Legacy component deprecation (6+ months post-migration)

**Backward Compatibility Guarantees**:
- **API Consistency**: All existing component APIs remain unchanged
- **Prop Compatibility**: New material components accept all existing props
- **Event Handling**: Existing event handlers and callbacks remain functional
- **CSS Class Preservation**: Original CSS classes maintained for custom styling
- **Theme Compatibility**: Existing theme system works with material enhancements

#### 9.2.2 Component-Specific Migration Plans

**Button Component Migration**:
```typescript
// Current button remains functional
export const Button = withMaterialMigration(
  OriginalButton,
  MaterialButton,
  {
    enableMaterialDesign: true,
    fallbackToOriginal: true,
    performanceThreshold: 60, // fps
    accessibilityCompliant: true
  }
);

// Material enhancement without breaking changes
interface MaterialButtonProps extends OriginalButtonProps {
  material?: 'wood' | 'metal' | 'auto';
  materialIntensity?: 'subtle' | 'normal' | 'enhanced';
}
```

**Input Component Migration**:
```typescript
// Enhanced input with material frame system
export const Input = withMaterialMigration(
  OriginalInput,
  MaterialInput,
  {
    enableMaterialDesign: true,
    fallbackToOriginal: true,
    performanceThreshold: 60,
    accessibilityCompliant: true
  }
);

// Graceful degradation for unsupported browsers
const MaterialInput: React.FC<InputProps> = (props) => {
  const supportsAdvancedCSS = useCSSSupportDetection();

  if (!supportsAdvancedCSS) {
    return <OriginalInput {...props} />;
  }

  return (
    <div className="material-input-container">
      <OriginalInput {...props} className={`material-input ${props.className || ''}`} />
    </div>
  );
};
```

### 9.3 Comprehensive Testing & Validation Framework

#### 9.3.1 Automated Testing Infrastructure

**Material System Testing Suite**:
```typescript
// Material authenticity testing
describe('Material System Validation', () => {
  test('Material Distribution Compliance', () => {
    // Per-screen targets are canonical (see Screen Mapping table).
    // Use SCREEN_MATERIAL_TARGETS[screenName] for listed screens;
    // defaults below apply only to new/unlisted screens.
    const { container } = render(<TestScreen />);
    const distribution = getMaterialDistribution(container);
    const targets = SCREEN_MATERIAL_TARGETS[screenName] ?? { paper: 60, metal: 25, wood: 10, glass: 4, fabric: 1 };
    const tolerance = 5; // ±5%

    Object.entries(targets).forEach(([material, target]) => {
      expect(distribution[material]).toBeWithinRange(target - tolerance, target + tolerance);
    });
  });

  test('Cross-Theme Material Consistency', () => {
    const themes = ['default', 'dusk', 'lime', 'ocean', 'retro', 'neo', 'forest', 'emerald', 'material-darker'];

    themes.forEach(theme => {
      const { container } = render(<TestScreen theme={theme} />);
      const materials = getMaterialElements(container);

      materials.forEach(material => {
        expect(material).toHaveMaterialAuthenticity();
        expect(material).toMaintainPhysicalProperties();
        expect(material).toHaveConsistentInteractions();
      });
    });
  });

  test('Performance Regression Detection', () => {
    const { container } = render(<ComplexMaterialScreen />);

    const performanceMetrics = measureRenderingPerformance(container);
    expect(performanceMetrics.fps).toBeGreaterThanOrEqual(60);
    expect(performanceMetrics.paintTime).toBeLessThanOrEqual(16); // 60fps budget
    expect(performanceMetrics.memoryUsage).toBeLessThanOrEqual(baselineMemoryUsage * 1.1);
  });

  test('Accessibility Compliance Validation', () => {
    const { container } = render(<MaterialComponentsSuite />);

    // High contrast mode testing
    fireEvent.mediaQuery('(prefers-contrast: high)');
    expect(container).toHaveAccessibleContrast();

    // Reduced motion testing
    fireEvent.mediaQuery('(prefers-reduced-motion: reduce)');
    expect(container).toHaveReducedMotionSupport();

    // Screen reader compatibility
    expect(container).toBeScreenReaderAccessible();
  });
});

// Visual regression testing
describe('Material Visual Consistency', () => {
  test('Component Visual Regression', async () => {
    const components = [
      'Button', 'Input', 'Card', 'Modal', 'Navigation', 'Table'
    ];

    for (const component of components) {
      const screenshot = await takeComponentScreenshot(component, 'all-themes');
      expect(screenshot).toMatchVisualSnapshot(`${component}-material-design`);
    }
  });
});

// Performance benchmarking
const performanceBenchmark = {
  renderingBudget: 16, // ms per frame for 60fps
  memoryBudgetIncrease: 10, // % increase from baseline
  bundleSizeIncrease: 15, // % increase from baseline

  validate: (metrics: PerformanceMetrics) => {
    return {
      renderingCompliant: metrics.avgFrameTime <= performanceBenchmark.renderingBudget,
      memoryCompliant: metrics.memoryIncrease <= performanceBenchmark.memoryBudgetIncrease,
      bundleCompliant: metrics.bundleIncrease <= performanceBenchmark.bundleSizeIncrease
    };
  }
};
```

#### 9.3.2 Manual Quality Assurance Procedures

**Material Authenticity Validation Checklist**:

*Wood Material Validation:*
- [ ] **Visual Inspection**: Grain pattern visible and realistic at 100% zoom
- [ ] **Interaction Testing**: Hover state enhances grain visibility appropriately
- [ ] **Active State**: Button press creates realistic depression effect
- [ ] **Cross-Theme**: Wood maintains species authenticity across all themes
- [ ] **Accessibility**: High contrast mode preserves wood identity with simplified texture

*Metal Material Validation:*
- [ ] **Surface Quality**: Brushed metal pattern consistent and directional
- [ ] **Reflection System**: Highlights follow lighting direction accurately
- [ ] **Edge Definition**: Sharp, precise edges with appropriate highlighting
- [ ] **Interaction Physics**: Hover enhances metallic reflection realistically
- [ ] **Performance**: No visible rendering delays or stuttering during interactions

*Paper Material Validation:*
- [ ] **Texture Visibility**: Paper fiber pattern subtle but present
- [ ] **Content Readability**: Text maintains excellent readability on paper surfaces
- [ ] **Shadow Behavior**: Paper elements cast appropriate shadows for elevation
- [ ] **Aging Effects**: Disabled states show realistic paper wear patterns
- [ ] **Transparency**: Paper maintains 95-98% opacity for authentic thickness

*Glass Material Validation:*
- [ ] **Transparency Quality**: Background content appropriately visible through glass
- [ ] **Edge Lighting**: Realistic glass edge highlights present
- [ ] **Refraction Effects**: Subtle background blur simulates glass refraction
- [ ] **Layering Behavior**: Glass elements properly layer above other materials
- [ ] **Clean Appearance**: No unrealistic smudges or imperfections

*Fabric Material Validation:*
- [ ] **Weave Pattern**: Textile weave visible at appropriate zoom levels
- [ ] **Light Absorption**: Matte finish with minimal reflectivity
- [ ] **Color Authenticity**: Natural textile color saturation (85-90%)
- [ ] **Background Role**: Fabric used appropriately for backgrounds only
- [ ] **Performance Impact**: Fabric textures don't impact rendering performance

#### 9.3.3 Cross-Browser Compatibility Validation

**Browser-Specific Testing Matrix**:

*Chrome/Chromium-based browsers:*
- [ ] **CSS Grid Support**: Material grid layouts render correctly
- [ ] **CSS Custom Properties**: Material tokens work across nested components
- [ ] **Backdrop Filters**: Glass material blur effects function properly
- [ ] **Advanced Gradients**: Complex material textures render without artifacts

*Firefox:*
- [ ] **Vendor Prefixes**: All material effects work with appropriate prefixes
- [ ] **Performance Parity**: Material animations maintain 60fps performance
- [ ] **Color Management**: Material colors consistent with other browsers
- [ ] **Shadow Rendering**: Material shadows render without visual artifacts

*Safari:*
- [ ] **WebKit Compatibility**: Material effects work on older WebKit versions
- [ ] **iOS Performance**: Material system performs well on mobile Safari
- [ ] **Color Profile Accuracy**: Materials maintain color accuracy across devices
- [ ] **Hardware Acceleration**: Material animations utilize GPU acceleration

*Edge:*
- [ ] **Legacy Support**: Graceful degradation for older Edge versions
- [ ] **Performance Consistency**: Material system performs comparably to Chrome
- [ ] **Feature Parity**: All material features work without Edge-specific bugs
- [ ] **Integration**: Material system integrates properly with Windows themes

### 9.4 Performance Impact Assessment & Optimization Strategy

#### 9.4.1 Detailed Performance Analysis

**Rendering Cost Assessment**:
```typescript
// Performance monitoring system
interface MaterialPerformanceMetrics {
  componentRenderTime: number;
  cssParsingTime: number;
  paintTime: number;
  compositeTime: number;
  memoryUsage: number;
  gpuMemoryUsage: number;
}

const performanceMonitor = {
  trackComponentRender: (componentName: string, materialType: string) => {
    return performance.measure(`${componentName}-${materialType}`, {
      start: performance.now(),
      end: performance.now(),
      detail: { componentName, materialType }
    });
  },

  analyzeMaterialComplexity: (element: HTMLElement) => {
    const styles = getComputedStyle(element);
    const complexity = {
      gradientCount: (styles.background.match(/gradient/g) || []).length,
      shadowCount: (styles.boxShadow.match(/,/g) || []).length + 1,
      filterCount: (styles.filter.match(/\w+\(/g) || []).length,
      transformCount: (styles.transform.match(/\w+\(/g) || []).length
    };

    // Calculate complexity score (higher = more expensive)
    return complexity.gradientCount * 2 +
           complexity.shadowCount * 1.5 +
           complexity.filterCount * 3 +
           complexity.transformCount * 1;
  }
};
```

**Performance Budget Definition**:
- **Rendering Budget**: Maximum 16ms per frame (60fps) for all material effects
- **Memory Budget**: Maximum 10% increase from baseline for material system
- **Bundle Size Budget**: Maximum 15% increase for material CSS and JavaScript
- **GPU Memory Budget**: Material textures and effects under 50MB GPU memory usage
- **Paint Budget**: Material updates must complete within 8ms paint window

**Material-Specific Performance Costs**:
1. **Wood Materials**: 2-3ms average render time (grain gradients + lighting)
2. **Metal Materials**: 1-2ms average render time (brushed texture + reflections)
3. **Paper Materials**: 0.5-1ms average render time (fiber texture only)
4. **Glass Materials**: 3-4ms average render time (blur filters + transparency)
5. **Fabric Materials**: 1-1.5ms average render time (weave pattern gradients)

#### 9.4.2 Performance Optimization Strategies

**Progressive Enhancement Architecture**:
```typescript
// Performance-aware material loading
class MaterialSystemManager {
  private performanceMode: 'high' | 'medium' | 'low' = 'high';
  private capabilities: DeviceCapabilities;

  constructor() {
    this.capabilities = this.detectDeviceCapabilities();
    this.performanceMode = this.determineOptimalMode();
  }

  private detectDeviceCapabilities(): DeviceCapabilities {
    return {
      hasGPU: this.detectGPUCapability(),
      ramAmount: navigator.deviceMemory || 4,
      connectionSpeed: navigator.connection?.effectiveType || '4g',
      batteryLevel: navigator.battery?.level || 1,
      cpuCores: navigator.hardwareConcurrency || 4
    };
  }

  private determineOptimalMode(): 'high' | 'medium' | 'low' {
    if (this.capabilities.ramAmount >= 8 && this.capabilities.hasGPU) {
      return 'high'; // Full material system
    } else if (this.capabilities.ramAmount >= 4) {
      return 'medium'; // Simplified materials
    } else {
      return 'low'; // Minimal material effects
    }
  }

  getMaterialConfig(materialType: string): MaterialConfig {
    const baseConfig = materialConfigs[materialType];

    switch (this.performanceMode) {
      case 'high':
        return baseConfig; // Full material fidelity
      case 'medium':
        return {
          ...baseConfig,
          gradientCount: Math.min(baseConfig.gradientCount, 2),
          shadowLayers: Math.min(baseConfig.shadowLayers, 2),
          animationDuration: baseConfig.animationDuration * 0.7
        };
      case 'low':
        return {
          ...baseConfig,
          gradientCount: 0, // No gradients
          shadowLayers: 1, // Single shadow only
          animationDuration: 0, // No animations
          texturePatterns: false // No texture patterns
        };
    }
  }
}
```

**Lazy Loading & Code Splitting Strategy**:
```typescript
// Material system code splitting
const MaterialSystemComponents = {
  // Core materials loaded immediately
  basic: () => import('./materials/basic'),

  // Advanced materials loaded on demand
  wood: () => import('./materials/wood'),
  metal: () => import('./materials/metal'),
  paper: () => import('./materials/paper'),
  glass: () => import('./materials/glass'),
  fabric: () => import('./materials/fabric'),

  // Interaction enhancements loaded after initial paint
  interactions: () => import('./materials/interactions'),
  animations: () => import('./materials/animations')
};

// Progressive material loading
export const useMaterialSystem = () => {
  const [loadedMaterials, setLoadedMaterials] = useState(new Set(['basic']));

  const loadMaterial = useCallback(async (material: string) => {
    if (!loadedMaterials.has(material)) {
      await MaterialSystemComponents[material]();
      setLoadedMaterials(prev => new Set([...prev, material]));
    }
  }, [loadedMaterials]);

  // Load materials based on viewport and interaction
  useIntersectionObserver({
    callback: (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const materialType = entry.target.dataset.material;
          if (materialType) loadMaterial(materialType);
        }
      });
    }
  });

  return { loadedMaterials, loadMaterial };
};
```

### 9.5 Cross-Platform & Cross-Browser Compatibility Strategy

#### 9.5.1 Browser-Specific Fallback Systems

**Feature Detection & Graceful Degradation**:
```typescript
// Comprehensive browser capability detection
class BrowserCapabilityDetector {
  private static instance: BrowserCapabilityDetector;
  private capabilities: Map<string, boolean>;

  constructor() {
    this.capabilities = new Map();
    this.detectCapabilities();
  }

  private detectCapabilities(): void {
    // CSS feature detection
    this.capabilities.set('backdropFilter', this.supportsBackdropFilter());
    this.capabilities.set('cssGrid', this.supportsCSSGrid());
    this.capabilities.set('customProperties', this.supportsCustomProperties());
    this.capabilities.set('multipleBackgrounds', this.supportsMultipleBackgrounds());
    this.capabilities.set('transforms3d', this.supports3DTransforms());
    this.capabilities.set('willChange', this.supportsWillChange());

    // Performance-related capabilities
    this.capabilities.set('hardwareAcceleration', this.hasHardwareAcceleration());
    this.capabilities.set('webGL', this.hasWebGLSupport());
    this.capabilities.set('highDPI', window.devicePixelRatio > 1);
  }

  private supportsBackdropFilter(): boolean {
    return CSS.supports('backdrop-filter', 'blur(10px)') ||
           CSS.supports('-webkit-backdrop-filter', 'blur(10px)');
  }

  private supportsCSSGrid(): boolean {
    return CSS.supports('display', 'grid');
  }

  private supportsCustomProperties(): boolean {
    return CSS.supports('--test', 'value');
  }

  getCapability(feature: string): boolean {
    return this.capabilities.get(feature) || false;
  }

  getMaterialCapabilityProfile(): MaterialCapabilityProfile {
    return {
      canRenderGlass: this.getCapability('backdropFilter'),
      canRenderComplexTextures: this.getCapability('multipleBackgrounds'),
      canUseHardwareAcceleration: this.getCapability('hardwareAcceleration'),
      canRenderAdvancedShadows: this.getCapability('transforms3d'),
      requiresFallbacks: !this.getCapability('customProperties')
    };
  }
}

// Material fallback system
interface MaterialFallbackConfig {
  wood: {
    fullSupport: string; // Full gradient + texture implementation
    limitedSupport: string; // Simplified gradient only
    noSupport: string; // Solid color fallback
  };
  metal: {
    fullSupport: string; // Full brushed metal with reflections
    limitedSupport: string; // Simple linear gradient
    noSupport: string; // Solid gray color
  };
  glass: {
    fullSupport: string; // Full backdrop filter + blur
    limitedSupport: string; // Opacity-only transparency
    noSupport: string; // Solid semi-transparent background
  };
}

const materialFallbacks: MaterialFallbackConfig = {
  wood: {
    fullSupport: `
      background:
        linear-gradient(45deg, transparent 30%, rgba(139, 69, 19, 0.1) 50%, transparent 70%),
        linear-gradient(135deg, #8B4513 0%, #A0522D 50%, #8B4513 100%);
    `,
    limitedSupport: `
      background: linear-gradient(135deg, #8B4513, #A0522D);
    `,
    noSupport: `
      background: #8B4513;
    `
  },
  metal: {
    fullSupport: `
      background:
        repeating-linear-gradient(90deg, transparent 0px, rgba(255,255,255,0.1) 1px, transparent 2px),
        linear-gradient(135deg, #C0C0C0 0%, #E8E8E8 30%, #C0C0C0 100%);
    `,
    limitedSupport: `
      background: linear-gradient(135deg, #C0C0C0, #E8E8E8);
    `,
    noSupport: `
      background: #C0C0C0;
    `
  },
  glass: {
    fullSupport: `
      backdrop-filter: blur(10px);
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.2);
    `,
    limitedSupport: `
      background: rgba(255, 255, 255, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.3);
    `,
    noSupport: `
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid #ccc;
    `
  }
};
```

#### 9.5.2 Platform-Specific Optimizations

**Electron-Specific Enhancements**:
```typescript
// Electron material system optimizations
class ElectronMaterialOptimizer {
  private isElectron: boolean;
  private electronVersion: string;

  constructor() {
    this.isElectron = this.detectElectronEnvironment();
    this.electronVersion = this.getElectronVersion();
  }

  private detectElectronEnvironment(): boolean {
    return typeof window !== 'undefined' &&
           typeof window.require === 'function';
  }

  getOptimizedMaterialConfig(): ElectronMaterialConfig {
    if (!this.isElectron) {
      return this.getWebMaterialConfig();
    }

    return {
      // Electron can handle more complex materials
      maxGradientLayers: 5, // vs 3 for web
      maxShadowLayers: 4,   // vs 2 for web
      enableAdvancedBlur: true,
      enableNativeEffects: this.supportsNativeEffects(),

      // Platform-specific optimizations
      useNativeWindowEffects: process.platform === 'win32',
      enableGPUAcceleration: true,
      materialRenderingMode: 'hardware-accelerated'
    };
  }

  private supportsNativeEffects(): boolean {
    return this.electronVersion >= '10.0.0';
  }
}

// Windows-specific material enhancements
const windowsOptimizations = {
  enableAcrylicEffects: process.platform === 'win32',
  useNativeBlur: process.platform === 'win32' && this.electronVersion >= '12.0.0',
  adaptToWindowsTheme: true,
  respectSystemAnimationSettings: true
};

// macOS-specific material enhancements
const macosOptimizations = {
  enableVibrancyEffects: process.platform === 'darwin',
  useNativeVibrancy: process.platform === 'darwin',
  adaptToMacOSAppearance: true,
  respectReducedMotion: true
};
```

### 9.6 Final Implementation Readiness Validation

#### 9.6.1 Pre-Implementation Checklist

**Technical Readiness Validation**:
- [ ] **Performance Infrastructure**: Monitoring and optimization systems implemented
- [ ] **Browser Compatibility**: Fallback systems tested across all supported browsers
- [ ] **Accessibility Framework**: High contrast, reduced motion, screen reader support validated
- [ ] **Testing Infrastructure**: Automated material validation and regression testing operational
- [ ] **Migration Tools**: Component migration utilities tested and documented
- [ ] **Documentation**: Comprehensive developer documentation and training materials complete

**Design System Readiness Validation**:
- [ ] **Material Token System**: Complete CSS custom property hierarchy implemented
- [ ] **Component Library**: All base material components designed and prototyped
- [ ] **Interaction Patterns**: Material physics and interaction behaviors defined
- [ ] **Theme Integration**: Material system tested across all 9 application themes
- [ ] **Quality Standards**: Material authenticity and consistency validation procedures established

**Organizational Readiness Validation**:
- [ ] **Development Team Training**: Material system understanding and implementation training completed
- [ ] **QA Process Integration**: Material validation integrated into quality assurance workflows
- [ ] **Rollout Strategy**: Gradual deployment plan with rollback procedures established
- [ ] **User Communication**: User-facing documentation and change communication prepared
- [ ] **Support Infrastructure**: Technical support processes updated for material system issues

#### 9.6.2 Success Metrics & Monitoring Framework

**Key Performance Indicators (KPIs)**:
1. **Material Authenticity Score**: Automated assessment of material realism (target: 90%+)
2. **Cross-Theme Consistency Score**: Material identity preservation across themes (target: 95%+)
3. **Performance Impact Score**: Rendering performance vs. baseline (target: <10% degradation)
4. **User Satisfaction Score**: User feedback on new material interface (target: 80%+ positive)
5. **Accessibility Compliance Score**: WCAG AAA compliance maintenance (target: 100%; AA floor for glass surfaces)

**Continuous Monitoring System**:
```typescript
// Material system health monitoring
interface MaterialSystemHealth {
  performanceMetrics: {
    averageRenderTime: number;
    frameDropCount: number;
    memoryUsageIncrease: number;
    bundleSizeImpact: number;
  };
  qualityMetrics: {
    materialAuthenticityScore: number;
    crossThemeConsistencyScore: number;
    userSatisfactionRating: number;
    accessibilityComplianceLevel: number;
  };
  errorMetrics: {
    materialRenderingErrors: number;
    crossBrowserInconsistencies: number;
    accessibilityViolations: number;
    performanceRegressions: number;
  };
}

const materialSystemMonitor = {
  trackHealth: (): MaterialSystemHealth => {
    return {
      performanceMetrics: gatherPerformanceMetrics(),
      qualityMetrics: assessQualityMetrics(),
      errorMetrics: collectErrorMetrics()
    };
  },

  alertOnThresholds: (health: MaterialSystemHealth) => {
    if (health.performanceMetrics.averageRenderTime > 16) {
      sendAlert('Performance threshold exceeded');
    }
    if (health.qualityMetrics.materialAuthenticityScore < 90) {
      sendAlert('Material authenticity below threshold');
    }
    if (health.errorMetrics.accessibilityViolations > 0) {
      sendAlert('Accessibility violations detected');
    }
  }
};
```

## 10. Implementation Coverage Cross-Reference

| Capability | Defined In | Validation Criteria |
|-----------|-----------|-------------------|
| Sprint-level timeline with deliverables and dependencies | §9.1 | Each sprint has exit criteria and dependency chain |
| Backward-compatible migration with rollback | §9.2, §1.4 | `withMaterialMigration()` HOC + barrel-swap protocol |
| Material authenticity and performance testing | §9.3, §16 | Automated visual regression + performance budget CI gates |
| Performance budgets and optimization techniques | §9.4, §16.2 | 60fps target on i5-8400 baseline; build-time CSS analysis |
| Cross-platform and Electron-specific fallbacks | §9.5 | Platform detection + graceful degradation matrix |
| Pre-implementation readiness checklist | §18 | 16-point checklist with section cross-references |

## 9.1.1 Component State Edge Cases

**Multi-State Component Handling**:
```css
/* Complex state combinations (e.g., hover + disabled, focus + loading) */
.material-component.disabled.loading {
  /* Material degradation with subtle activity indication */
  background:
    var(--material-texture),
    repeating-linear-gradient(45deg, transparent 0px, transparent 10px, rgba(0,0,0,0.02) 10px, rgba(0,0,0,0.02) 20px),
    var(--material-base-color);
  filter: grayscale(60%) brightness(0.8);
  animation: subtle-material-pulse 2s infinite ease-in-out;
}

.material-component.error.focus {
  /* Error state with focus - material shows stress */
  box-shadow:
    inset 0 0 0 2px var(--material-error-color),
    0 0 8px var(--material-error-glow),
    var(--material-shadow-base);
  background:
    var(--material-texture),
    radial-gradient(circle at center, rgba(220,38,38,0.05) 0%, transparent 70%),
    var(--material-base-color);
}
```

**State Transition Recovery Patterns**:
```javascript
// Material state recovery system
class MaterialStateManager {
  constructor(element) {
    this.element = element;
    this.currentMaterialState = 'rest';
    this.transitionQueue = [];
    this.materialType = this.element.dataset.material || 'paper';
  }

  transitionToState(newState, options = {}) {
    const materialPhysics = this.getMaterialPhysics(this.materialType);
    const transition = {
      from: this.currentMaterialState,
      to: newState,
      duration: options.duration || materialPhysics.defaultTransition,
      timing: options.timing || materialPhysics.timingFunction,
      recovery: options.allowRecovery !== false
    };

    // Queue transition if material is still settling from previous state
    if (this.isTransitioning()) {
      this.transitionQueue.push(transition);
      return;
    }

    this.executeTransition(transition);
  }

  // Handles interrupted transitions with material-appropriate recovery
  handleInterruptedTransition(newState) {
    const currentProgress = this.getTransitionProgress();
    const materialRecovery = this.calculateMaterialRecovery(currentProgress, newState);

    // Natural material recovery based on physics
    this.executeRecovery(materialRecovery);
  }

  getMaterialPhysics(materialType) {
    const physics = {
      wood: {
        defaultTransition: 300,
        timingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        recoveryMultiplier: 0.7,
        dampening: 0.8
      },
      metal: {
        defaultTransition: 150,
        timingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        recoveryMultiplier: 0.5,
        dampening: 0.9
      },
      paper: {
        defaultTransition: 250,
        timingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        recoveryMultiplier: 0.6,
        dampening: 0.7
      }
    };
    return physics[materialType] || physics.paper;
  }
}
```

#### 9.1.2 Cross-Browser Material Consistency

**Material Rendering Fallback System**:
```css
/* Progressive enhancement for material textures */
.material-wood {
  /* Fallback: solid color for unsupported browsers */
  background: var(--material-wood-fallback-color);

  /* Enhanced: basic gradient for limited support */
  background: linear-gradient(135deg, #A0522D 0%, #8B4513 100%);

  /* Full: complete material texture for modern support */
  background:
    var(--texture-wood-grain-walnut),
    linear-gradient(135deg, #A0522D 0%, #8B4513 50%, #654321 100%);

  /* Feature detection override */
  @supports (background: conic-gradient(red, blue)) {
    background:
      var(--texture-wood-grain-advanced),
      var(--material-wood-gradient-complex);
  }
}

/* OS-specific material adaptations */
@media (-webkit-min-device-pixel-ratio: 2) {
  /* High-DPI material enhancement for Retina/HiDPI displays */
  .material-component {
    --texture-scale-factor: 0.5;
    --shadow-blur-enhancement: 1.5;
  }
}

/* Windows-specific material rendering */
@supports (-ms-high-contrast: active) {
  .material-component {
    /* Windows High Contrast mode material simplification */
    background: var(--material-high-contrast-color) !important;
    box-shadow: none !important;
    border: 2px solid var(--material-high-contrast-border) !important;
  }
}
```

**Browser Compatibility Testing Framework**:
```javascript
// Material consistency testing across browser engines
class MaterialCompatibilityTester {
  constructor() {
    this.supportedFeatures = this.detectMaterialSupport();
    this.fallbackStrategy = this.determineFallbackStrategy();
  }

  detectMaterialSupport() {
    const features = {
      gradientSupport: this.testGradientSupport(),
      backdropFilterSupport: this.testBackdropFilter(),
      customPropertySupport: this.testCustomProperties(),
      advancedShadowSupport: this.testAdvancedShadows()
    };

    return features;
  }

  testGradientSupport() {
    const testElement = document.createElement('div');
    testElement.style.background = 'linear-gradient(45deg, red, blue)';
    return testElement.style.background !== '';
  }

  testBackdropFilter() {
    return CSS.supports('backdrop-filter', 'blur(10px)');
  }

  applyMaterialFallbacks() {
    if (!this.supportedFeatures.gradientSupport) {
      document.documentElement.classList.add('no-gradient-support');
    }
    if (!this.supportedFeatures.backdropFilterSupport) {
      document.documentElement.classList.add('no-backdrop-filter');
    }
  }
}
```

#### 9.1.3 Accessibility Material Integration

**Accessibility-Material Contrast Requirements**:

**Advanced Accessibility Material Adaptations**:
```css
/* High contrast material adaptation */
@media (prefers-contrast: high) {
  .material-wood {
    /* Maintain wood identity with enhanced contrast */
    background: var(--material-wood-high-contrast);
    border: 3px solid var(--material-wood-border-high-contrast);
    box-shadow: none; /* Remove subtle shadows that may reduce contrast */

    /* Enhanced text contrast on wood surfaces */
    color: var(--text-wood-high-contrast);
    text-shadow: none;
  }

  .material-metal {
    /* Metal with enhanced definition */
    background: var(--material-metal-high-contrast);
    border: 2px solid var(--material-metal-border-high-contrast);

    /* Simplified texture for clarity */
    background-image: none;
  }

  .material-paper {
    /* Paper with maximum contrast while maintaining texture hint */
    background: var(--material-paper-high-contrast);
    border: 1px solid var(--material-paper-border-high-contrast);

    /* Subtle texture indication */
    background-image:
      radial-gradient(circle at 30% 40%, var(--paper-texture-high-contrast) 1px, transparent 2px);
  }
}

/* Reduced motion material adaptations */
@media (prefers-reduced-motion: reduce) {
  .material-component {
    /* Disable all material physics animations */
    transition: none !important;
    animation: none !important;
    transform: none !important;
  }

  .material-component:hover,
  .material-component:active,
  .material-component:focus {
    /* State changes through color/border only */
    transition: background-color 0.1s linear, border-color 0.1s linear;
  }

  .material-wood:hover {
    /* Wood hover without animation - color change only */
    background-color: var(--material-wood-hover-color-static);
  }

  .material-metal:active {
    /* Metal press without physics - border change only */
    border-width: 3px;
    border-color: var(--material-metal-active-border);
  }
}

/* Screen reader material descriptions */
.material-wood[aria-label]::after {
  content: " (wood button)";
  clip: rect(0 0 0 0);
  position: absolute;
}

.material-metal[aria-label]::after {
  content: " (metal control)";
  clip: rect(0 0 0 0);
  position: absolute;
}

.material-paper[aria-label]::after {
  content: " (document surface)";
  clip: rect(0 0 0 0);
  position: absolute;
}
```

#### 9.1.4 Performance Optimization Strategies

**GPU-Accelerated Material Rendering**:

**Advanced Performance Optimization Framework**:
```css
/* GPU acceleration for material components */
.material-component {
  /* Force hardware acceleration for material effects */
  transform: translateZ(0);
  will-change: transform, opacity, box-shadow;

  /* Optimize for 60fps interactions */
  backface-visibility: hidden;
  perspective: 1000px;
}

/* Material texture optimization levels */
.material-wood {
  /* Base level: Simple gradient (mobile, low-end devices) */
  background: var(--material-wood-simple-gradient);
}

@media (min-resolution: 96dpi) and (min-width: 1024px) {
  .material-wood {
    /* Enhanced level: Basic texture (desktop, moderate performance) */
    background:
      var(--texture-wood-basic),
      var(--material-wood-simple-gradient);
  }
}

@media (min-resolution: 144dpi) and (min-width: 1920px) {
  .material-wood {
    /* Premium level: Full texture (high-end devices, full experience) */
    background:
      var(--texture-wood-grain-walnut),
      var(--texture-wood-grain-mahogany),
      var(--material-wood-complex-gradient);
  }
}

/* Performance budget enforcement */
.performance-constrained .material-component {
  /* Emergency fallback for performance issues */
  background: var(--material-fallback-color) !important;
  box-shadow: var(--material-simple-shadow) !important;
  transition-duration: 100ms !important;
}
```

**Material Performance Monitoring System**:
```javascript
// Performance monitoring for material rendering
class MaterialPerformanceMonitor {
  constructor() {
    this.renderBudget = 16.67; // Target: 60fps (16.67ms per frame)
    this.currentComplexityLevel = 'full';
    this.performanceHistory = [];
  }

  measureMaterialRender(materialComponent) {
    const startTime = performance.now();

    // Force reflow to measure actual render cost
    materialComponent.offsetHeight;

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    this.recordPerformance(renderTime, materialComponent);

    if (renderTime > this.renderBudget) {
      this.optimizeMaterialComplexity(materialComponent);
    }
  }

  optimizeMaterialComplexity(component) {
    const currentLevel = component.dataset.materialComplexity || 'full';

    switch(currentLevel) {
      case 'full':
        component.dataset.materialComplexity = 'reduced';
        component.classList.add('material-reduced-complexity');
        break;
      case 'reduced':
        component.dataset.materialComplexity = 'minimal';
        component.classList.add('material-minimal-complexity');
        break;
      case 'minimal':
        component.classList.add('performance-constrained');
        break;
    }
  }

  monitorGlobalMaterialPerformance() {
    // Monitor overall page performance with materials
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        if (entry.duration > 50) { // Slow interaction threshold
          this.handleSlowMaterialInteraction(entry);
        }
      });
    });

    observer.observe({ entryTypes: ['measure'] });
  }
}
```

#### 9.1.5 Testing & Validation Enhancements

**Automated Material Testing Suite**:

**Automated Material Validation System**:
```javascript
// Comprehensive material testing framework
class MaterialValidationSuite {
  constructor() {
    this.validationRules = this.loadValidationRules();
    this.testResults = {};
  }

  loadValidationRules() {
    return {
      materialDistribution: {
        paper: { min: 55, max: 65, tolerance: 5 },
        wood: { min: 20, max: 30, tolerance: 5 },
        metal: { min: 5, max: 15, tolerance: 5 },
        glass: { min: 1, max: 7, tolerance: 2 },
        fabric: { min: 0, max: 3, tolerance: 1 }
      },
      materialAuthenticity: {
        wood: {
          requiredProperties: ['grain-pattern', 'natural-color', 'wood-texture'],
          forbiddenColors: ['blue', 'green', 'purple', 'bright-red'],
          physicsRequired: ['compression', 'spring-back', 'natural-timing']
        },
        metal: {
          requiredProperties: ['brushed-texture', 'metallic-reflection', 'sharp-edges'],
          forbiddenColors: ['wood-brown', 'paper-white', 'fabric-texture'],
          physicsRequired: ['rigid-response', 'sharp-transitions', 'reflection-changes']
        }
      },
      crossThemeConsistency: {
        materialIdentityPreservation: true,
        materialPhysicsConsistency: true,
        accessibilityMaintenance: true
      }
    };
  }

  async runFullValidationSuite() {
    const results = {
      materialDistribution: await this.validateMaterialDistribution(),
      materialAuthenticity: await this.validateMaterialAuthenticity(),
      crossThemeConsistency: await this.validateCrossThemeConsistency(),
      performanceCompliance: await this.validatePerformanceCompliance(),
      accessibilityCompliance: await this.validateAccessibilityCompliance()
    };

    return this.generateValidationReport(results);
  }

  async validateMaterialDistribution() {
    const materialElements = document.querySelectorAll('[class*="material-"]');
    const distribution = this.calculateMaterialDistribution(materialElements);

    const violations = [];
    Object.entries(this.validationRules.materialDistribution).forEach(([material, rules]) => {
      if (distribution[material] < rules.min - rules.tolerance ||
          distribution[material] > rules.max + rules.tolerance) {
        violations.push({
          material,
          expected: `${rules.min}%-${rules.max}%`,
          actual: `${distribution[material]}%`,
          severity: 'critical'
        });
      }
    });

    return {
      passed: violations.length === 0,
      distribution,
      violations
    };
  }

  async validateMaterialAuthenticity() {
    const results = {};

    for (const [materialType, rules] of Object.entries(this.validationRules.materialAuthenticity)) {
      const elements = document.querySelectorAll(`.material-${materialType}`);
      const materialResults = [];

      elements.forEach(element => {
        const computedStyle = getComputedStyle(element);
        const materialResult = {
          element: element,
          authenticity: this.checkMaterialAuthenticity(computedStyle, rules),
          physics: this.validateMaterialPhysics(element, rules.physicsRequired)
        };
        materialResults.push(materialResult);
      });

      results[materialType] = materialResults;
    }

    return results;
  }

  checkMaterialAuthenticity(computedStyle, rules) {
    const authenticity = {
      passed: true,
      violations: []
    };

    // Check required material properties
    rules.requiredProperties.forEach(property => {
      if (!this.hasRequiredProperty(computedStyle, property)) {
        authenticity.passed = false;
        authenticity.violations.push(`Missing required property: ${property}`);
      }
    });

    // Check forbidden color usage
    const backgroundColor = computedStyle.backgroundColor;
    rules.forbiddenColors.forEach(forbiddenColor => {
      if (this.colorMatchesForbidden(backgroundColor, forbiddenColor)) {
        authenticity.passed = false;
        authenticity.violations.push(`Forbidden color detected: ${forbiddenColor}`);
      }
    });

    return authenticity;
  }

  validateMaterialPhysics(element, requiredPhysics) {
    const physics = {
      passed: true,
      violations: []
    };

    requiredPhysics.forEach(physicsType => {
      if (!this.hasPhysicsBehavior(element, physicsType)) {
        physics.passed = false;
        physics.violations.push(`Missing physics behavior: ${physicsType}`);
      }
    });

    return physics;
  }

  async validateCrossThemeConsistency() {
    const themes = ['default', 'dark', 'dusk', 'lime', 'ocean', 'retro', 'neo', 'forest'];
    const consistencyResults = {};

    for (const theme of themes) {
      // Switch to theme
      document.documentElement.setAttribute('data-theme', theme);
      await this.waitForThemeTransition();

      // Validate material consistency in this theme
      const themeResults = await this.validateMaterialAuthenticity();
      consistencyResults[theme] = themeResults;
    }

    return this.analyzeCrossThemeConsistency(consistencyResults);
  }

  generateValidationReport(results) {
    const report = {
      overallStatus: this.calculateOverallStatus(results),
      summary: this.generateSummary(results),
      detailedFindings: results,
      recommendations: this.generateRecommendations(results),
      timestamp: new Date().toISOString()
    };

    return report;
  }
}

// Usage in build process
const validator = new MaterialValidationSuite();
validator.runFullValidationSuite().then(report => {
  if (!report.overallStatus.passed) {
    console.error('Material validation failed:', report);
    process.exit(1); // Fail build if material standards not met
  } else {
    console.log('Material validation passed:', report.summary);
  }
});
```

### 9.2 Implementation Readiness Coverage

| Area | Section | Status |
|------|---------|--------|
| Component state edge cases | §9.1.1 | Multi-state handling with material physics recovery defined |
| Cross-browser consistency | §9.1.2 | Progressive enhancement with fallback strategies |
| Accessibility integration | §9.1.3 | High contrast and reduced motion material adaptations |
| Performance optimization | §9.1.4 | Multi-level complexity with automatic degradation |
| Automated testing | §9.1.5 | Validation suite with build integration |

## 10a. Implementation Readiness & Explicit Reuse Guidance

### 10.1 Implementation Coverage Assessment

**Coverage Metrics**:
- **Component Coverage**: 33/33 components catalogued with material specs
- **Material System Coverage**: 5/5 material types with implementation code
- **Theme Coverage**: 7/9 themes with adaptation specifications (⚠️ `emerald` and `material-darker` still need material adaptations)
- **Accessibility Coverage**: WCAG AAA compliant (7:1 normal text, 4.5:1 large text) with adaptations per material; AA 4.5:1 floor for glass/overlay surfaces
- **Performance Validation**: Optimization framework with automated monitoring
- **Cross-Browser Support**: Progressive enhancement with fallback strategies

### 10.2 Explicit Component Reuse Guidelines for Builder Implementation

#### 10.2.1 Immediate Implementation Order (Builder Execution Sequence)

**Phase 1: Foundation Setup (Week 1)**
1. **Implement Design Token System**:
   ```bash
   # Files to create/modify in exact order:
   src/design-system/tokens/material-tokens.css
   src/design-system/tokens/theme-tokens.css
   src/design-system/foundation/material-base.css
   ```

2. **Material Component Classes**:
   ```bash
   # Component base classes (implement in this exact order):
   src/components/materials/MaterialWood.css
   src/components/materials/MaterialMetal.css
   src/components/materials/MaterialPaper.css
   src/components/materials/MaterialGlass.css
   src/components/materials/MaterialFabric.css
   ```

**Phase 2: Core Components (Week 2-3)**
3. **High-Priority Components (60% of UI)**:
   ```bash
   # Paper-based components (primary surface coverage):
   src/components/Card/TaskCard.tsx + TaskCard.module.css
   src/components/Layout/ContentArea.tsx + ContentArea.module.css
   src/components/Forms/InputField.tsx + InputField.module.css
   src/components/Layout/MainContainer.tsx + MainContainer.module.css
   ```

4. **Wood-based Components (25% of UI)**:
   ```bash
   # Primary action components:
   src/components/Button/Button.tsx + Button.module.css
   src/components/Navigation/Sidebar.tsx + Sidebar.module.css
   src/components/Navigation/Header.tsx + Header.module.css
   src/components/Navigation/TabBar.tsx + TabBar.module.css
   ```

**Phase 3: Supporting Elements (Week 4)**
5. **Metal/Glass/Fabric Components (15% of UI)**:
   ```bash
   # Secondary and overlay components:
   src/components/Controls/Toggle.tsx + Toggle.module.css (metal)
   src/components/Overlays/Modal.tsx + Modal.module.css (glass)
   src/components/Layout/Background.tsx + Background.module.css (fabric)
   ```

#### 10.2.2 Component Pattern Reuse Standards

**Universal Component Template Structure**:
```typescript
// MANDATORY template for ALL new components
import { MaterialComponent, MaterialType } from '@/design-system/materials';
import { InteractionPhysics } from '@/design-system/interactions';

interface ComponentProps {
  material: MaterialType; // REQUIRED - no default values
  variant?: 'primary' | 'secondary' | 'tertiary';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  children: React.ReactNode;
}

export const ReusableComponent: React.FC<ComponentProps> = ({
  material,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  children,
  ...props
}) => {
  // MANDATORY: Apply material base class
  const materialClass = `material-${material}`;

  // MANDATORY: Apply interaction physics
  const interactionClass = disabled
    ? 'material-disabled'
    : `material-interactive material-${material}-physics`;

  // MANDATORY: Apply component variant
  const variantClass = `component-${variant}`;
  const sizeClass = `component-${size}`;

  return (
    <div
      className={`
        ${materialClass}
        ${interactionClass}
        ${variantClass}
        ${sizeClass}
        reusable-component
      `}
      data-material={material}
      data-variant={variant}
      data-size={size}
      aria-disabled={disabled}
      {...props}
    >
      {children}
    </div>
  );
};
```

#### 10.2.3 Material Distribution Reuse Validation

**MANDATORY Distribution Checker** (to be run during build — per §8.1.3 measurement methodology):
```typescript
// REQUIRED: Include in ALL screen-level validations
// NOTE: Per-screen targets from the Screen Mapping table are canonical.
// The defaults below apply ONLY to new screens not yet in the table.
export const validateMaterialDistribution = (
  screenName: string,
  componentTree: ComponentNode[]
) => {
  const distribution = calculateMaterialUsage(componentTree); // See §8.1.3 for area computation

  // Per-screen targets are canonical; fall back to global defaults for unlisted screens
  const screenTargets = SCREEN_MATERIAL_TARGETS[screenName] ?? {
    paper: 60, metal: 25, wood: 10, glass: 4, fabric: 1
  };
  const tolerance = 5; // ±5% per material
  const hardErrorThreshold = 10; // ±10% triggers build error

  Object.entries(screenTargets).forEach(([material, target]) => {
    const actual = distribution[material];
    const delta = Math.abs(actual - target);
    if (delta > hardErrorThreshold) {
      throw new BuildError(
        `Material distribution HARD ERROR on "${screenName}": ${material} is ${actual}% ` +
        `but target is ${target}% (±${hardErrorThreshold}% max). Delta: ${delta}%`
      );
    } else if (delta > tolerance) {
      console.warn(
        `Material distribution WARNING on "${screenName}": ${material} is ${actual}% ` +
        `but target is ${target}% (±${tolerance}% preferred). Delta: ${delta}%`
      );
    }
  });
};
```

### 10.3 Theme Implementation Reuse Patterns

#### 10.3.1 Theme-Agnostic Component Development

**MANDATORY Theme Integration Pattern**:
```css
/* REQUIRED: Every component must follow this exact pattern */
.component-name {
  /* Step 1: Apply material base (theme-agnostic) */
  @apply material-paper-base;

  /* Step 2: Apply theme-specific colors */
  background: var(--material-paper-surface-color);
  border: var(--material-paper-border-color);
  color: var(--material-paper-text-color);

  /* Step 3: Apply material physics (theme-agnostic) */
  transition: var(--material-paper-transition-standard);
  box-shadow: var(--material-paper-elevation-resting);

  /* Step 4: Apply interactive states */
  &:hover {
    background: var(--material-paper-surface-color-hover);
    box-shadow: var(--material-paper-elevation-hover);
    transform: var(--material-paper-transform-hover);
  }

  &:active {
    background: var(--material-paper-surface-color-active);
    box-shadow: var(--material-paper-elevation-active);
    transform: var(--material-paper-transform-active);
  }

  &:focus-visible {
    outline: var(--material-paper-focus-outline);
    box-shadow:
      var(--material-paper-elevation-resting),
      var(--material-paper-focus-shadow);
  }

  &:disabled {
    background: var(--material-paper-surface-color-disabled);
    color: var(--material-paper-text-color-disabled);
    box-shadow: var(--material-paper-elevation-disabled);
    cursor: not-allowed;
  }
}
```

#### 10.3.2 Accessibility Reuse Implementation

**MANDATORY Accessibility Pattern** (for ALL interactive components):
```typescript
// REQUIRED: Apply to every interactive component
export const useAccessibleMaterial = (materialType: MaterialType) => {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const prefersHighContrast = useMediaQuery('(prefers-contrast: high)');

  // MANDATORY: Material-aware accessibility adaptations
  const accessibilityClasses = useMemo(() => {
    const classes = [`accessible-${materialType}`];

    if (prefersReducedMotion) {
      classes.push(`${materialType}-reduced-motion`);
    }

    if (prefersHighContrast) {
      classes.push(`${materialType}-high-contrast`);
    }

    return classes.join(' ');
  }, [materialType, prefersReducedMotion, prefersHighContrast]);

  // MANDATORY: Screen reader material descriptions
  const materialAriaLabel = useMemo(() => {
    const materialDescriptions = {
      wood: 'wooden control',
      metal: 'metal control',
      paper: 'document surface',
      glass: 'overlay panel',
      fabric: 'background surface'
    };
    return materialDescriptions[materialType];
  }, [materialType]);

  return {
    accessibilityClasses,
    materialAriaLabel,
    accessibilityProps: {
      'aria-label': materialAriaLabel,
      'data-material-accessibility': materialType,
      role: 'button', // Default - override as needed
    }
  };
};
```

### 10.4 Performance Optimization Reuse Guidelines

#### 10.4.1 Component Performance Standards

**MANDATORY Performance Optimization Pattern**:
```typescript
// REQUIRED: Apply to ALL material components
export const useMaterialPerformance = (materialType: MaterialType) => {
  // MANDATORY: Lazy load complex materials
  const [materialLoaded, setMaterialLoaded] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !materialLoaded) {
            // Load material textures only when needed
            loadMaterialAssets(materialType);
            setMaterialLoaded(true);
          }
        });
      },
      { threshold: 0.1 }
    );

    return () => observer.disconnect();
  }, [materialType, materialLoaded]);

  // MANDATORY: Hardware acceleration for materials
  const performanceClasses = useMemo(() => {
    return [
      'hardware-accelerated',
      `material-${materialType}-optimized`,
      materialLoaded ? 'material-enhanced' : 'material-basic'
    ].join(' ');
  }, [materialType, materialLoaded]);

  return {
    performanceClasses,
    materialLoaded
  };
};
```

### 10.5 Quality Assurance Reuse Framework

#### 10.5.1 Component Testing Standards

**MANDATORY Test Template** (for every component):
```typescript
// REQUIRED: Include in ALL component test files
import { MaterialValidationSuite } from '@/testing/material-validation';

describe('ComponentName Material Integration', () => {
  const validator = new MaterialValidationSuite();

  // MANDATORY: Material authenticity test
  test('maintains material authenticity across themes', async () => {
    const themes = ['default', 'dark', 'dusk', 'lime', 'ocean', 'retro', 'neo', 'forest'];

    for (const theme of themes) {
      render(<ComponentName material="wood" />, { theme });

      const result = await validator.validateMaterialAuthenticity('wood');
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    }
  });

  // MANDATORY: Interaction physics test
  test('applies correct material physics', async () => {
    const { container } = render(<ComponentName material="wood" />);

    const element = container.firstChild;
    fireEvent.mouseEnter(element);

    const physics = await validator.validateMaterialPhysics(element, 'wood');
    expect(physics.compressionResponse).toBe('natural');
    expect(physics.springBackTiming).toMatch(/ease-out/);
  });

  // MANDATORY: Accessibility integration test
  test('maintains accessibility with material enhancement', () => {
    const { container } = render(<ComponentName material="wood" />);

    expect(container.firstChild).toHaveAttribute('aria-label');
    expect(container.firstChild).toHaveClass('accessible-wood');
  });
});
```

### 10.6 Migration and Implementation Strategy

#### 10.6.1 Existing Component Migration Pattern

**Step-by-Step Migration Process** (for every existing component):

1. **Analysis Phase**:
   ```bash
   # REQUIRED: Analyze current component
   npm run analyze-component ComponentName
   # Outputs: current material usage, interaction patterns, theme dependencies
   ```

2. **Material Assignment Phase**:
   ```typescript
   // MANDATORY: Assign appropriate material based on function
   const materialAssignment = determineMaterialByFunction({
     isPrimaryAction: true,     // → wood
     isContentSurface: false,   // → not paper
     isSecondaryControl: false, // → not metal
     isOverlay: false,          // → not glass
     isBackground: false        // → not fabric
   });
   // Result: 'wood' for primary action button
   ```

3. **Implementation Phase**:
   ```typescript
   // BEFORE (existing flat component)
   const Button = ({ children, onClick }) => (
     <button className="flat-button" onClick={onClick}>
       {children}
     </button>
   );

   // AFTER (material-enhanced component)
   const Button = ({ children, onClick, variant = 'primary' }) => {
     const { accessibilityProps } = useAccessibleMaterial('wood');
     const { performanceClasses } = useMaterialPerformance('wood');

     return (
       <button
         className={`
           material-wood
           material-wood-physics
           wood-button-${variant}
           ${performanceClasses}
         `}
         onClick={onClick}
         {...accessibilityProps}
       >
         {children}
       </button>
     );
   };
   ```

4. **Validation Phase**:
   ```bash
   # MANDATORY: Validate migration
   npm run validate-material-component Button
   # Must pass: authenticity, physics, accessibility, performance checks
   ```

#### 10.6.2 Build Integration Requirements

**MANDATORY Build Process Integration**:
```json
// package.json scripts - REQUIRED
{
  "scripts": {
    "validate-materials": "node scripts/validate-material-distribution.js",
    "test-material-physics": "jest --testMatch='**/*.material.test.{js,ts}'",
    "build:materials": "npm run validate-materials && npm run test-material-physics && npm run build",
    "analyze-material-coverage": "node scripts/analyze-material-coverage.js"
  }
}
```

### 10.7 Documentation Requirements for Reuse

#### 10.7.1 Component Documentation Standards

**MANDATORY Documentation Template** (for every component):
```markdown
# ComponentName

## Material Assignment
- **Primary Material**: wood
- **Rationale**: Primary action component requiring natural, tactile feedback
- **Distribution Impact**: Contributes to 25% wood allocation

## Usage Examples
```tsx
// CORRECT: Proper material usage
<ComponentName material="wood" variant="primary" size="medium">
  Action Label
</ComponentName>

// INCORRECT: Wrong material assignment
<ComponentName material="glass"> {/* Glass reserved for overlays only */}
  Action Label
</ComponentName>
```

## Material Behavior
- **Hover**: Natural wood compression with 150ms ease-out
- **Active**: 2px depression with shadow adjustment
- **Focus**: Wood grain highlight with accessible outline
- **Disabled**: Faded wood appearance with matte finish

## Accessibility Integration
- Screen reader: Announces as "wooden action button"
- High contrast: Maintains wood identity with enhanced borders
- Reduced motion: Static color changes only

## Performance Characteristics
- Lazy loads: Wood texture patterns on scroll into view
- GPU accelerated: Transform and shadow animations
- Fallback: Solid wood-tone color for unsupported browsers

## Testing Checklist
- [ ] Material authenticity across all 9 themes
- [ ] Interaction physics match wood material properties
- [ ] Accessibility features preserved with material enhancement
- [ ] Performance meets 60fps standard for all interactions
- [ ] Cross-browser consistency maintained
```

### 10.8 Implementation Readiness Confirmation

**Coverage Summary** — All required implementation artifacts are present:
- Exact file implementation order defined (§9.1)
- Universal component wrapper templates (§10.2)
- Material distribution validation with build integration (§8.1.2, §8.1.3)
- Theme-agnostic development patterns (§10.3)
- Material-aware accessibility implementation (§15)
- Lazy loading and hardware acceleration (§10.4)
- Material validation testing framework (§10.5)
- Step-by-step existing component migration (§10.6)
- Documentation standards (§10.7)
- Automated and manual validation processes (§10.5)

## 11. React/TypeScript Component Interface Specifications

This section provides complete TypeScript interface definitions for every material component, ensuring type-safe implementation alongside the CSS design system. These interfaces bridge the gap between CSS styling specifications and React component architecture.

### 11.1 Core Material Type System

```typescript
// types/materials.ts - Core material type definitions

/** The five foundational material types in the skeuomorphic design system */
export type MaterialType = 'wood' | 'metal' | 'paper' | 'glass' | 'fabric';

/** Material variant options within each material type
 *  ⚠️ CORRECTED: These match both the actual TypeScript types in design-system/types.ts
 *  AND the CSS token names in design-system/tokens/materials.css.
 *  An earlier draft used phantom names (cherry, aluminum, dark-steel) that don't exist in the codebase. */
export type WoodVariant = 'walnut' | 'mahogany' | 'oak';
export type MetalVariant = 'platinum' | 'steel' | 'titanium';
export type PaperVariant = 'cream' | 'white' | 'aged';
export type GlassVariant = 'clear' | 'tinted' | 'frosted';
export type FabricVariant = 'linen' | 'canvas' | 'charcoal';

export type MaterialVariant =
  | WoodVariant
  | MetalVariant
  | PaperVariant
  | GlassVariant
  | FabricVariant;

/** Elevation levels for depth hierarchy */
export type ElevationLevel = 0 | 1 | 2 | 3 | 4 | 6 | 8 | 12;

/** Component size variants */
export type ComponentSize = 'small' | 'medium' | 'large';

/** Interactive state for components */
export type InteractionState =
  | 'default'
  | 'hover'
  | 'active'
  | 'focus'
  | 'disabled'
  | 'loading';

/** Material physics properties for animation configuration */
export interface MaterialPhysics {
  compressDistance: number;   // px
  timingFunction: string;    // CSS cubic-bezier
  transitionDuration: number; // ms
  hoverBrightness: number;
  activeBrightness: number;
}

/** Material configuration for a component */
export interface MaterialConfig {
  type: MaterialType;
  variant?: MaterialVariant;
  elevation?: ElevationLevel;
  interactive?: boolean;
  physics?: Partial<MaterialPhysics>;
}
```

### 11.2 Theme System Interfaces

```typescript
// types/theme.ts - Theme switching and management types

/** All supported application themes */
export type ThemeName =
  | 'default'
  | 'dusk'
  | 'lime'
  | 'ocean'
  | 'retro'
  | 'neo'
  | 'forest';

/** Theme mode (light or dark variant) */
export type ThemeMode = 'light' | 'dark';

/** User theme preference source */
export type ThemeSource = 'user' | 'system' | 'default';

/** Complete theme configuration */
export interface ThemeConfig {
  name: ThemeName;
  mode: ThemeMode;
  source: ThemeSource;
  materialOverrides?: Partial<Record<MaterialType, string>>; // Theme-specific material color overrides
  contrastLevel?: 'normal' | 'high'; // Accessibility contrast mode
  reducedMotion?: boolean;
}

/** Theme context value provided to all components */
export interface ThemeContextValue {
  currentTheme: ThemeConfig;
  setTheme: (theme: ThemeName) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  systemPreference: ThemeMode;
  materialSystemEnabled: boolean;
  performanceMode: 'high' | 'medium' | 'low';
}

/** Props for the ThemeProvider component */
export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeName;
  defaultMode?: ThemeMode;
  persistPreference?: boolean;
  respectSystemPreference?: boolean;
  storageKey?: string;
  onThemeChange?: (config: ThemeConfig) => void;
}
```

### 11.3 Base Component Interfaces

```typescript
// types/components.ts - Shared component prop interfaces

/** Base props shared by all material components */
export interface MaterialComponentProps {
  material?: MaterialType;
  materialVariant?: MaterialVariant;
  elevation?: ElevationLevel;
  size?: ComponentSize;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'data-testid'?: string;
}

/** Props for interactive material components */
export interface InteractiveMaterialProps extends MaterialComponentProps {
  disabled?: boolean;
  loading?: boolean;
  onInteractionStateChange?: (state: InteractionState) => void;
}
```

### 11.4 Component-Specific Interfaces

```typescript
// components/Button/types.ts
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'icon' | 'toggle';
export type ButtonIntent = 'default' | 'danger' | 'success' | 'warning';

export interface MaterialButtonProps extends InteractiveMaterialProps {
  variant?: ButtonVariant;
  intent?: ButtonIntent;
  fullWidth?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
}

// Default material mappings:
// primary -> wood (walnut), secondary -> metal (steel), tertiary -> paper (cream)
// icon -> metal (platinum), toggle -> wood (oak)

// components/Input/types.ts
export type InputType = 'text' | 'number' | 'email' | 'password' | 'search' | 'url' | 'tel';
export type InputState = 'default' | 'focus' | 'error' | 'success' | 'disabled';

export interface MaterialInputProps extends InteractiveMaterialProps {
  type?: InputType;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  label?: string;
  helperText?: string;
  errorMessage?: string;
  required?: boolean;
  readOnly?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
}
// Default material: metal frame (platinum) + paper content (cream)

// components/Card/types.ts
export type CardVariant = 'content' | 'interactive' | 'elevated' | 'inset';

export interface MaterialCardProps extends MaterialComponentProps {
  variant?: CardVariant;
  selected?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}
// Default material: paper (cream), interactive variant adds hover/focus behaviors

// components/Modal/types.ts
export type ModalSize = 'small' | 'medium' | 'large' | 'fullscreen';

export interface MaterialModalProps extends MaterialComponentProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: ModalSize;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement>;
  returnFocusRef?: React.RefObject<HTMLElement>;
}
// Default material: glass (clear) with paper (cream) content area

// components/Sidebar/types.ts
export interface SidebarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  badge?: string | number;
  children?: SidebarItem[];
}

export interface MaterialSidebarProps extends MaterialComponentProps {
  items: SidebarItem[];
  activeItemId?: string;
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}
// Default material: metal (steel) panel with wood (walnut) active indicators

// components/Tabs/types.ts
export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  closable?: boolean;
}

export interface MaterialTabsProps extends MaterialComponentProps {
  tabs: TabItem[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  variant?: 'default' | 'bordered' | 'pills';
}
// Default material: wood (walnut) active tab, metal (platinum) inactive tabs

// components/Table/types.ts
export interface TableColumn<T = unknown> {
  key: string;
  header: string;
  width?: string | number;
  sortable?: boolean;
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
}

export interface MaterialTableProps<T = unknown> extends MaterialComponentProps {
  columns: TableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyState?: React.ReactNode;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string) => void;
  onRowClick?: (row: T, index: number) => void;
  selectedRows?: Set<number>;
  stickyHeader?: boolean;
  virtualized?: boolean;
}
// Default material: paper (cream) content, metal (steel) header, wood (walnut) sort indicators

// components/Toggle/types.ts
export interface MaterialToggleProps extends InteractiveMaterialProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  labelPosition?: 'left' | 'right';
}
// Default material: metal (steel) track, wood (oak) knob

// components/Checkbox/types.ts
export interface MaterialCheckboxProps extends InteractiveMaterialProps {
  checked?: boolean;
  indeterminate?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
}
// Default material: metal (platinum) frame, wood (walnut) checkmark

// components/Select/types.ts
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

export interface MaterialSelectProps extends InteractiveMaterialProps {
  options: SelectOption[];
  value?: string | string[];
  defaultValue?: string | string[];
  placeholder?: string;
  label?: string;
  multiple?: boolean;
  searchable?: boolean;
  onChange?: (value: string | string[]) => void;
}
// Default material: metal (platinum) frame, paper (cream) dropdown, glass (clear) overlay

// components/Slider/types.ts
export interface MaterialSliderProps extends InteractiveMaterialProps {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  label?: string;
  showValue?: boolean;
  onChange?: (value: number) => void;
}
// Default material: metal (steel) track, wood (walnut) thumb

// components/Toast/types.ts
export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastConfig {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  action?: { label: string; onClick: () => void };
  dismissible?: boolean;
}

export interface MaterialToastProps extends MaterialComponentProps {
  config: ToastConfig;
  onDismiss: () => void;
}
// Default material: paper (aged) with material-specific accent borders

// components/ProgressIndicator/types.ts
export type ProgressVariant = 'linear' | 'circular' | 'skeleton';

export interface MaterialProgressProps extends MaterialComponentProps {
  variant?: ProgressVariant;
  value?: number; // 0-100, undefined = indeterminate
  label?: string;
  showPercentage?: boolean;
}
// Default material: metal (steel) track, wood (walnut) fill

// components/Tooltip/types.ts
export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface MaterialTooltipProps extends MaterialComponentProps {
  content: React.ReactNode;
  placement?: TooltipPlacement;
  delay?: number;
  children: React.ReactElement;
}
// Default material: glass (tinted) with paper (cream) text

// components/Badge/types.ts
export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface MaterialBadgeProps extends MaterialComponentProps {
  variant?: BadgeVariant;
  count?: number;
  maxCount?: number;
  dot?: boolean;
  children?: React.ReactNode;
}
// Default material: metal (titanium) stamped plate appearance

// components/Avatar/types.ts
export interface MaterialAvatarProps extends MaterialComponentProps {
  src?: string;
  alt?: string;
  fallback?: string;
  shape?: 'circle' | 'square';
}
// Default material: wood (oak) frame with paper (cream) content

// components/Breadcrumb/types.ts
export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
}

export interface MaterialBreadcrumbProps extends MaterialComponentProps {
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
  maxItems?: number;
}
// Default material: paper (cream) surface with metal (platinum) separators
```

### 11.5 Custom Hooks Interfaces

```typescript
// hooks/useMaterialTheme.ts
export interface UseMaterialThemeReturn {
  theme: ThemeConfig;
  materialClasses: (material: MaterialType, options?: {
    variant?: MaterialVariant;
    interactive?: boolean;
    elevation?: ElevationLevel;
  }) => string;
  cssVars: Record<string, string>;
  isDark: boolean;
  isHighContrast: boolean;
  reducedMotion: boolean;
}

// hooks/useMaterialInteraction.ts
export interface UseMaterialInteractionReturn {
  interactionState: InteractionState;
  interactionProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onMouseDown: () => void;
    onMouseUp: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
  isHovered: boolean;
  isPressed: boolean;
  isFocused: boolean;
}

// hooks/useMaterialAnimation.ts
export interface UseMaterialAnimationReturn {
  animationStyle: React.CSSProperties;
  triggerEntrance: () => void;
  triggerExit: () => Promise<void>;
  isAnimating: boolean;
}

// hooks/useMaterialPerformance.ts
export interface UseMaterialPerformanceReturn {
  performanceMode: 'high' | 'medium' | 'low';
  shouldUseTextures: boolean;
  shouldUseAnimations: boolean;
  shouldUseBackdropFilter: boolean;
  maxGradients: number;
  reportMetric: (metric: string, value: number) => void;
}
```

## 12. Theme Switching Implementation Architecture

This section addresses the complete theme switching mechanism, covering runtime theme changes, persistence, system preference detection, and FOUC prevention.

### 12.1 ThemeProvider Component Architecture

```typescript
// context/ThemeProvider.tsx - Complete theme switching implementation

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'auto-claude-theme-preference';
const CSS_TRANSITION_CLASS = 'theme-transitioning';
const TRANSITION_DURATION = 300; // ms

/** Detect system color scheme preference */
function getSystemPreference(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Detect reduced motion preference */
function getReducedMotionPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Load persisted theme preference */
function loadPersistedTheme(): Partial<ThemeConfig> | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/** Apply theme CSS custom properties to document root */
function applyThemeToDOM(config: ThemeConfig): void {
  const root = document.documentElement;

  // Set theme data attributes
  root.setAttribute('data-theme', config.name);
  root.setAttribute('data-theme-mode', config.mode);
  root.setAttribute('data-contrast', config.contrastLevel || 'normal');

  // Apply material system state
  if (config.reducedMotion) {
    root.classList.add('reduced-motion');
  } else {
    root.classList.remove('reduced-motion');
  }

  // Apply material color overrides for theme-specific adaptations
  if (config.materialOverrides) {
    Object.entries(config.materialOverrides).forEach(([material, color]) => {
      root.style.setProperty(`--material-${material}-theme-override`, color);
    });
  }
}

/** Prevent FOUC during theme switch */
function transitionTheme(callback: () => void): Promise<void> {
  return new Promise((resolve) => {
    const root = document.documentElement;
    root.classList.add(CSS_TRANSITION_CLASS);

    // Apply transition styles
    root.style.setProperty('--theme-transition-duration', `${TRANSITION_DURATION}ms`);

    // Execute theme change
    requestAnimationFrame(() => {
      callback();

      // Remove transition class after animation
      setTimeout(() => {
        root.classList.remove(CSS_TRANSITION_CLASS);
        resolve();
      }, TRANSITION_DURATION);
    });
  });
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = 'default',
  defaultMode,
  persistPreference = true,
  respectSystemPreference = true,
  storageKey = STORAGE_KEY,
  onThemeChange,
}: ThemeProviderProps) {
  const systemPreference = useSystemThemePreference();
  const reducedMotion = useReducedMotionPreference();

  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(() => {
    const persisted = persistPreference ? loadPersistedTheme() : null;
    return {
      name: persisted?.name || defaultTheme,
      mode: persisted?.mode || defaultMode || (respectSystemPreference ? systemPreference : 'light'),
      source: persisted ? 'user' : (respectSystemPreference ? 'system' : 'default'),
      contrastLevel: 'normal',
      reducedMotion,
    };
  });

  // Apply theme to DOM on mount and changes
  useEffect(() => {
    applyThemeToDOM(themeConfig);
  }, [themeConfig]);

  // Persist preference
  useEffect(() => {
    if (persistPreference && themeConfig.source === 'user') {
      localStorage.setItem(storageKey, JSON.stringify({
        name: themeConfig.name,
        mode: themeConfig.mode,
      }));
    }
  }, [themeConfig, persistPreference, storageKey]);

  // Listen for system preference changes
  useEffect(() => {
    if (!respectSystemPreference || themeConfig.source === 'user') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setThemeConfig(prev => ({
        ...prev,
        mode: e.matches ? 'dark' : 'light',
        source: 'system',
      }));
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [respectSystemPreference, themeConfig.source]);

  const setTheme = useCallback((name: ThemeName) => {
    transitionTheme(() => {
      setThemeConfig(prev => {
        const next = { ...prev, name, source: 'user' as const };
        onThemeChange?.(next);
        return next;
      });
    });
  }, [onThemeChange]);

  const setMode = useCallback((mode: ThemeMode) => {
    transitionTheme(() => {
      setThemeConfig(prev => {
        const next = { ...prev, mode, source: 'user' as const };
        onThemeChange?.(next);
        return next;
      });
    });
  }, [onThemeChange]);

  const toggleMode = useCallback(() => {
    setMode(themeConfig.mode === 'light' ? 'dark' : 'light');
  }, [themeConfig.mode, setMode]);

  const contextValue = useMemo<ThemeContextValue>(() => ({
    currentTheme: themeConfig,
    setTheme,
    setMode,
    toggleMode,
    systemPreference,
    materialSystemEnabled: true,
    performanceMode: 'high',
  }), [themeConfig, setTheme, setMode, toggleMode, systemPreference]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
```

### 12.2 FOUC Prevention CSS

```css
/* FOUC prevention - applied before React hydration via inline <script> in HTML */
/* Include this in the Electron HTML template BEFORE the app bundle */

/*
<script>
  (function() {
    try {
      var stored = JSON.parse(localStorage.getItem('auto-claude-theme-preference'));
      if (stored) {
        document.documentElement.setAttribute('data-theme', stored.name || 'default');
        document.documentElement.setAttribute('data-theme-mode', stored.mode || 'light');
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme-mode', 'dark');
      }
    } catch(e) {}
  })();
</script>
*/

/* Theme transition styles */
.theme-transitioning,
.theme-transitioning * {
  transition:
    background-color var(--theme-transition-duration, 300ms) ease,
    color var(--theme-transition-duration, 300ms) ease,
    border-color var(--theme-transition-duration, 300ms) ease,
    box-shadow var(--theme-transition-duration, 300ms) ease !important;
}

/* Dark mode material adaptations */
[data-theme-mode="dark"] {
  /* Wood retains warm brown in dark mode — just darker stain */
  --material-wood-walnut: #5C3310;
  --material-wood-mahogany: #6B3520;
  --material-metal-steel: #3A3A3A;
  --material-metal-platinum: #4A4A4A;
  /* Paper in dark mode is relatively lighter than surrounding surfaces;
     it is NOT near-black (that would break reading metaphor — see ADR-005) */
  --material-paper-cream: #2A2520;
  --material-paper-white: #1E1E1E;
  --material-paper-text-color: #E8E4DC;
  --material-glass-clear-base: rgba(30, 30, 30, 0.85);
  --material-fabric-linen-base: #1A1816;

  /* Adjusted lighting for dark mode */
  --light-primary-intensity: 0.2;
  --light-ambient-intensity: 0.08;

  /* Enhanced shadow visibility in dark mode */
  --elevation-2: 0 1px 3px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.45);
  --elevation-3: 0 3px 6px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.35);
  --elevation-4: 0 6px 12px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.35);
}

/* Per-theme material color adaptations preserving material authenticity */
/* NOTE: Wood ALWAYS retains warm brown hue range (ADR-005). Theme influence
   is limited to tinting/staining the natural material, not replacing it.
   Forbidden: blue wood, green wood, red wood, purple wood. */

[data-theme="ocean"] {
  --material-wood-walnut-base: #7B5B3A;    /* Salt-weathered driftwood — warm brown with gray undertone */
  --material-metal-steel-base: #B8C4D4;    /* Sea-weathered steel */
  --material-paper-cream-base: #F8FAFB;    /* Sea foam paper */
  --material-fabric-linen-base: #F0F4F6;   /* Sail canvas */
}

[data-theme="forest"] {
  --material-wood-walnut-base: #6B4E2A;    /* Forest floor walnut — warm brown with earthy undertone */
  --material-paper-cream-base: #F0FFF0;    /* Honeydew (corrected from #HONEYDEW) */
  --material-metal-steel-base: #8B9B7A;    /* Patina metal */
  --material-fabric-linen-base: #E8E4D8;   /* Natural hemp */
}

[data-theme="retro"] {
  --material-wood-walnut-base: #8B6914;    /* Vintage oak — warm amber-brown */
  --material-metal-steel-base: #C4A882;    /* Brass */
  --material-paper-cream-base: #FDF5E6;    /* Parchment */
  --material-fabric-linen-base: #F0E6D4;   /* Vintage linen */
}

[data-theme="dusk"] {
  --material-wood-walnut-base: #7B5A4B;    /* Twilight-stained walnut — warm brown with cool undertone */
  --material-metal-steel-base: #9B8BA0;    /* Lavender steel */
  --material-paper-cream-base: #FAF5FC;    /* Dusk-tinted paper */
  --material-fabric-linen-base: #F2ECF4;   /* Evening linen */
}

[data-theme="lime"] {
  --material-wood-walnut-base: #7B6B2E;    /* Sun-bleached willow — warm brown with yellow undertone */
  --material-metal-steel-base: #A8B8A0;    /* Verdigris steel */
  --material-paper-cream-base: #FAFCF5;    /* Spring paper */
  --material-fabric-linen-base: #F0F4EC;   /* Fresh linen */
}

[data-theme="neo"] {
  --material-wood-walnut-base: #5C5050;    /* Ebony-stained walnut — near-black warm brown */
  --material-metal-steel-base: #E0E0E8;    /* Chrome */
  --material-paper-cream-base: #2A2A30;    /* Dark reading surface (see ADR note) */
  --material-paper-text-color: #E8E8EC;    /* Light text on dark paper — maintains reading metaphor */
  --material-fabric-linen-base: #1A1A1E;   /* Technical fabric */
  /* Neo paper is dark but MUST maintain ≥7:1 contrast with text (WCAG AAA).
     Paper identity preserved via fiber texture overlay, not via color.
     Current: #2A2A30 bg with #E8E8EC text = ~11.3:1 contrast ratio — passes AAA. */
}
```

### 12.3 Theme Switching UI Component

```typescript
// components/ThemeSwitcher/ThemeSwitcher.tsx

export interface ThemeSwitcherProps {
  showModeToggle?: boolean;
  showThemeSelector?: boolean;
  compact?: boolean;
}

/**
 * Theme switching component providing both theme selection and light/dark mode toggle.
 *
 * Material: Metal (platinum) frame with wood (walnut) active indicator
 *
 * Implementation:
 * - Uses metal-framed selector buttons for theme choices
 * - Wood-material active state indicator for currently selected theme
 * - Glass overlay for dropdown theme menu in compact mode
 * - Smooth theme transition using transitionTheme() utility
 * - Persists selection to localStorage
 * - Respects and displays system preference with override capability
 */
```

## 13. Radix UI Integration Strategy

The existing Auto-Claude application uses Radix UI primitives for accessible component foundations. This section defines the integration layer that wraps Radix components with the skeuomorphic material design system while preserving all accessibility features.

### 13.1 Integration Architecture

```
┌─────────────────────────────────────────────────────┐
│                Application Code                      │
│    Uses: <MaterialButton>, <MaterialInput>, etc.     │
├─────────────────────────────────────────────────────┤
│              Material Design Layer                   │
│    Adds: Textures, shadows, material physics,        │
│          interaction animations, material classes     │
├─────────────────────────────────────────────────────┤
│              Radix UI Primitives                     │
│    Provides: Accessibility, keyboard nav, ARIA,      │
│              focus management, state management      │
├─────────────────────────────────────────────────────┤
│              CSS Design Token System                 │
│    Provides: Material tokens, elevation, textures,   │
│              lighting, physics, timing               │
└─────────────────────────────────────────────────────┘
```

### 13.2 Radix Wrapper Pattern

```typescript
// components/MaterialButton/MaterialButton.tsx
// Example: Wrapping Radix Button primitive with material design

import * as RadixButton from '@radix-ui/react-button'; // or existing button primitive
import { useMaterialInteraction } from '../../hooks/useMaterialInteraction';
import { useMaterialTheme } from '../../hooks/useMaterialTheme';
import { MaterialButtonProps } from './types';
import { cn } from '../../utils/cn';

const VARIANT_MATERIAL_MAP: Record<ButtonVariant, MaterialType> = {
  primary: 'wood',
  secondary: 'metal',
  tertiary: 'paper',
  icon: 'metal',
  toggle: 'wood',
};

export const MaterialButton = React.forwardRef<HTMLButtonElement, MaterialButtonProps>(
  ({ variant = 'primary', material, size = 'medium', className, children, disabled, loading, ...props }, ref) => {
    const resolvedMaterial = material || VARIANT_MATERIAL_MAP[variant];
    const { materialClasses } = useMaterialTheme();
    const { interactionProps, interactionState } = useMaterialInteraction({ disabled, loading });

    return (
      <RadixButton.Root
        ref={ref}
        className={cn(
          'material-component',
          materialClasses(resolvedMaterial, { interactive: true }),
          `button-${variant}`,
          `button-${size}`,
          interactionState !== 'default' && `state-${interactionState}`,
          className
        )}
        disabled={disabled || loading}
        aria-busy={loading}
        {...interactionProps}
        {...props}
      >
        {loading ? <MaterialSpinner material={resolvedMaterial} size="inline" /> : children}
      </RadixButton.Root>
    );
  }
);
```

### 13.3 Radix Component Integration Map

| Radix Primitive | Material Wrapper | Primary Material | Notes |
|----------------|-----------------|-----------------|-------|
| `@radix-ui/react-dialog` | `MaterialModal` | glass (container), paper (content) | Focus trap preserved |
| `@radix-ui/react-dropdown-menu` | `MaterialDropdown` | glass (overlay), paper (items) | Keyboard nav preserved |
| `@radix-ui/react-popover` | `MaterialPopover` | glass (container) | Positioning preserved |
| `@radix-ui/react-tooltip` | `MaterialTooltip` | glass (tinted) | Delay/dismiss preserved |
| `@radix-ui/react-checkbox` | `MaterialCheckbox` | metal (frame), wood (check) | Tri-state preserved |
| `@radix-ui/react-radio-group` | `MaterialRadioGroup` | metal (frame), wood (dot) | Group semantics preserved |
| `@radix-ui/react-switch` | `MaterialToggle` | metal (track), wood (thumb) | Toggle semantics preserved |
| `@radix-ui/react-slider` | `MaterialSlider` | metal (track), wood (thumb) | Range behavior preserved |
| `@radix-ui/react-select` | `MaterialSelect` | metal (frame), glass (dropdown) | Typeahead preserved |
| `@radix-ui/react-tabs` | `MaterialTabs` | wood (active), metal (inactive) | Panel association preserved |
| `@radix-ui/react-accordion` | `MaterialAccordion` | paper (panels), metal (headers) | Animation preserved |
| `@radix-ui/react-toast` | `MaterialToast` | paper (aged) with accent | Auto-dismiss preserved |
| `@radix-ui/react-progress` | `MaterialProgress` | metal (track), wood (fill) | ARIA preserved |
| `@radix-ui/react-avatar` | `MaterialAvatar` | wood (frame), paper (content) | Fallback preserved |
| `@radix-ui/react-scroll-area` | `MaterialScrollArea` | metal (scrollbar), paper (content) | Overflow preserved |

### 13.4 Migration Compatibility Layer

```typescript
// utils/materialMigration.ts

/**
 * Higher-order component for gradual migration from Radix to Material components.
 * Supports feature-flag-based switching between old and new implementations.
 *
 * Usage:
 *   const Button = withMaterialMigration(RadixButton, MaterialButton, {
 *     featureFlag: 'skeuomorphic-buttons',
 *     fallbackOnError: true,
 *   });
 *
 * The migration wrapper:
 * 1. Checks feature flag status (localStorage, remote config, or env variable)
 * 2. Renders MaterialComponent if enabled, RadixComponent if disabled
 * 3. Catches render errors in MaterialComponent and falls back to Radix
 * 4. Reports migration analytics (render time, error rate)
 * 5. Supports per-component gradual rollout
 */
export function withMaterialMigration<P extends object>(
  OriginalComponent: React.ComponentType<P>,
  MaterialComponent: React.ComponentType<P>,
  config: {
    featureFlag: string;
    fallbackOnError?: boolean;
    trackAnalytics?: boolean;
  }
): React.ComponentType<P>;
```

## 14. User Onboarding & Design Transition Strategy

This section addresses the user experience during the transition from flat design to skeuomorphic, ensuring users understand and adapt to the new interface patterns smoothly.

### 14.1 Phased Rollout Strategy

**Phase 1: Silent Preparation (Week 1-2)**
- Deploy material CSS tokens and base classes alongside existing styles
- No visible changes to users
- Performance baseline monitoring established

**Phase 2: Opt-In Preview (Week 3-4)**
- Add "Preview New Design" toggle in Settings
- Users can switch between flat and skeuomorphic designs
- Collect user feedback via in-app survey
- Track usage patterns and preference data

**Phase 3: Default with Opt-Out (Week 5-6)**
- New users get skeuomorphic by default
- Existing users see a guided introduction modal on first visit:
  - "We've redesigned your workspace with a new tactile interface"
  - Brief animated tour highlighting 3-4 key material metaphors
  - "Try it" / "Keep classic" buttons
- Opt-out available via Settings > Appearance > "Classic Mode"

**Phase 4: Full Migration (Week 7-8)**
- Classic mode deprecated with notice
- All users on skeuomorphic design
- Feedback collection continues

### 14.2 Guided Introduction Flow

```typescript
// components/OnboardingTour/OnboardingTour.tsx

export interface OnboardingStep {
  targetSelector: string;
  title: string;
  description: string;
  materialHighlight: MaterialType;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    targetSelector: '[data-onboarding="sidebar"]',
    title: 'Brushed Metal Navigation',
    description: 'Your navigation panel now features brushed metal styling. Active items are highlighted with warm wood accents, making it clear where you are.',
    materialHighlight: 'metal',
    position: 'right',
  },
  {
    targetSelector: '[data-onboarding="main-content"]',
    title: 'Paper-Textured Content',
    description: 'Content areas use subtle paper textures for comfortable reading. Cards lift slightly when you hover, just like picking up a real card.',
    materialHighlight: 'paper',
    position: 'bottom',
  },
  {
    targetSelector: '[data-onboarding="primary-button"]',
    title: 'Wooden Action Buttons',
    description: 'Primary action buttons are crafted from warm wood materials. They press down when clicked, giving satisfying tactile feedback.',
    materialHighlight: 'wood',
    position: 'bottom',
  },
  {
    targetSelector: '[data-onboarding="modal-trigger"]',
    title: 'Glass Overlays',
    description: 'Dialogs and overlays use frosted glass effects, letting you see your content underneath while focusing on the current task.',
    materialHighlight: 'glass',
    position: 'top',
  },
];
```

### 14.3 User Preference Persistence

```typescript
// Stored user preferences for design transition
interface UserDesignPreferences {
  designMode: 'skeuomorphic' | 'classic';
  onboardingCompleted: boolean;
  onboardingDismissedAt?: string;
  materialAnimationsEnabled: boolean;
  textureIntensity: 'full' | 'subtle' | 'none'; // For users who prefer less visual complexity
  feedbackSurveyCompleted: boolean;
}
```

### 14.4 Cognitive Load Management

**Strategies to reduce confusion during transition:**

1. **Consistent Metaphors**: Every material maps to a clear function (wood = actions, metal = structure, paper = content) - users learn the pattern once
2. **Progressive Disclosure**: Subtle textures initially, increasing authenticity as user familiarity grows
3. **Familiar Layouts**: Keep all navigation and content placement identical; only visual treatment changes
4. **Tooltip Hints**: Optional material-aware tooltips ("This wooden button starts your build") during first week
5. **Escape Hatch**: Always-available "Simplify Design" option that reduces textures and shadows while keeping material colors

## 15. Accessibility Validation Framework

This section provides concrete WCAG compliance testing procedures specific to skeuomorphic design challenges.

### 15.1 Skeuomorphic-Specific Accessibility Risks

| Risk | WCAG Criterion | Mitigation |
|------|---------------|------------|
| Texture patterns reduce text readability | 1.4.6 Contrast (Enhanced — AAA) | Text areas use solid backgrounds or extremely subtle textures (opacity < 0.03); target 7:1 contrast for normal text, 4.5:1 for large text |
| Complex shadows make focus indicators less visible | 2.4.7 Focus Visible | Material-specific focus rings: wood = orange glow, metal = blue glow, paper = dark outline |
| Material physics animations may disorient | 2.3.1 Three Flashes | All animations < 3 flashes/sec; `prefers-reduced-motion` disables all material physics |
| Depth cues rely on shadow (visual only) | 1.3.1 Info and Relationships | Semantic HTML + ARIA roles convey hierarchy independent of visual depth |
| Material metaphors confuse screen readers | 4.1.2 Name, Role, Value | ARIA labels describe function, not material ("Submit" not "Wooden submit button") |
| Wood grain textures interpreted as content | 1.1.1 Non-text Content | All textures applied via CSS `background-image` (decorative, not content) |
| Glass blur effects reduce content visibility | 1.4.6 Contrast (Enhanced — AAA) | Glass overlays use sufficient opacity (min 0.85) to maintain contrast ratio; AAA (7:1) target, AA (4.5:1) floor with documented rationale |

### 15.2 Automated Accessibility Testing Suite

```typescript
// tests/accessibility/materialA11y.test.ts

import { axe, toHaveNoViolations } from 'jest-axe';
import { render } from '@testing-library/react';

expect.extend(toHaveNoViolations);

describe('Material Component Accessibility', () => {
  // Test each material type meets contrast requirements
  const MATERIAL_COMPONENTS = [
    { name: 'MaterialButton', material: 'wood', minContrast: 7.0 },
    { name: 'MaterialButton', material: 'metal', minContrast: 7.0 },
    { name: 'MaterialCard', material: 'paper', minContrast: 7.0 },
    { name: 'MaterialModal', material: 'glass', minContrast: 4.5 }, // Glass overlays: AAA infeasible due to transparency; AA (4.5:1) is the floor
  ];

  MATERIAL_COMPONENTS.forEach(({ name, material, minContrast }) => {
    it(`${name} (${material}) passes axe accessibility audit`, async () => {
      const { container } = render(
        <ThemeProvider>
          <Component material={material}>Test Content</Component>
        </ThemeProvider>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it(`${name} (${material}) maintains ${minContrast}:1 contrast in light mode (AAA target, AA floor for glass)`, () => {
      // Contrast validation logic for text against material background
      // Normal text: 7:1 (AAA) required for wood/metal/paper; 4.5:1 (AA floor) for glass
      // Large text (≥18pt or ≥14pt bold): 4.5:1 (AAA) required for all materials
    });

    it(`${name} (${material}) maintains ${minContrast}:1 contrast in dark mode (AAA target, AA floor for glass)`, () => {
      // Dark mode contrast validation — same thresholds as light mode
    });
  });

  // Focus indicator visibility tests
  describe('Focus Indicators', () => {
    it('focus ring is visible against all material backgrounds', () => {
      // Test focus ring contrast against each material type
    });

    it('focus indicator meets 3:1 contrast ratio against adjacent colors', () => {
      // WCAG 2.4.11 Focus Not Obscured
    });
  });

  // Reduced motion tests
  describe('Reduced Motion', () => {
    it('disables all material physics when prefers-reduced-motion is set', () => {
      // Verify no transform, no transition, no animation
    });

    it('maintains visual state differentiation without animations', () => {
      // Hover, active, focus states still visually distinct via color/border changes
    });
  });

  // Screen reader tests
  describe('Screen Reader Compatibility', () => {
    it('material textures are not announced by screen readers', () => {
      // Verify textures are role="presentation" or CSS-only
    });

    it('interactive state changes are announced via aria-live', () => {
      // Loading states, error states announced appropriately
    });
  });
});
```

### 15.3 Manual Accessibility Validation Checklist

**Per-Component Validation (run for every material component):**

- [ ] **Keyboard Navigation**: Tab reaches component, Enter/Space activates, Escape dismisses overlays
- [ ] **Focus Visible**: Focus ring clearly visible against component's material background in both themes
- [ ] **Color Contrast**: Normal text passes 7:1 (AAA) against material texture + color; large text (≥18pt/14pt bold) passes 4.5:1 (AAA). Glass/overlay surfaces: AA floor (4.5:1 normal, 3:1 large) is acceptable with documented rationale.
- [ ] **Screen Reader**: VoiceOver/NVDA announces component role, state, and label correctly
- [ ] **High Contrast Mode**: Windows High Contrast mode renders component functionally (may lose material appearance)
- [ ] **Zoom 200%**: Component remains usable at 200% zoom without content clipping
- [ ] **Reduced Motion**: Component works correctly with `prefers-reduced-motion: reduce`
- [ ] **Touch Target**: Interactive elements have minimum 44x44px touch target
- [ ] **Error Identification**: Error states conveyed through text/icon, not color alone

**Cross-Theme Validation:**

- [ ] All 9 themes × 2 modes (18 combinations) pass contrast requirements
- [ ] Material-specific focus rings are visible in every theme
- [ ] Dark mode maintains equivalent accessibility to light mode

### 15.4 High Contrast Mode Support

```css
/* Windows High Contrast Mode support */
@media (forced-colors: active) {
  .material-component {
    /* Remove decorative textures and shadows */
    background-image: none !important;
    box-shadow: none !important;
    backdrop-filter: none !important;

    /* Use system colors for accessibility */
    border: 2px solid ButtonText;
    color: ButtonText;
    background-color: ButtonFace;
  }

  .material-component:hover {
    border-color: Highlight;
    color: HighlightText;
    background-color: Highlight;
  }

  .material-component:focus {
    outline: 3px solid Highlight;
    outline-offset: 2px;
  }

  .material-component:disabled {
    border-color: GrayText;
    color: GrayText;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .material-component {
    transition-duration: 0ms !important;
    animation: none !important;
    transform: none !important;
  }

  /* Maintain state differentiation through color changes only */
  .material-component:hover {
    filter: brightness(var(--material-hover-brightness));
    /* No transform or shadow animation */
  }

  .material-component:active {
    filter: brightness(var(--material-active-brightness));
    /* No physical depression animation */
  }
}
```

## 16. Adaptive Material System & Performance Budgets

This section addresses adaptive material allocation and automated performance enforcement requirements.

### 16.1 Adaptive Material Distribution

```typescript
// utils/adaptiveMaterials.ts

/**
 * Adaptive material allocation system that adjusts material distribution
 * based on interface context and user preferences.
 *
 * NOTE: Per-screen targets in the Screen Mapping table are the canonical source
 * of truth. This adaptive system modifies the ACTIVE screen's targets at runtime
 * based on user/device context — it does NOT override the per-screen baseline,
 * it adjusts from it. The 60/25/10/4/1 defaults below are starting points
 * for screens not yet listed in the Screen Mapping table.
 *
 * Adaptation factors:
 * - User accessibility needs (high contrast → simplified materials)
 * - Device performance capability (low-end → reduced textures)
 * - Interface density (dense views → less wood/glass, more paper)
 * - User workflow patterns (power users → subtle materials)
 */

export interface MaterialAllocation {
  paper: number;  // Default: 60%
  metal: number;  // Default: 25%
  wood: number;   // Default: 10%
  glass: number;  // Default: 4%
  fabric: number; // Default: 1%
}

export function calculateAdaptiveAllocation(context: {
  performanceMode: 'high' | 'medium' | 'low';
  interfaceDensity: 'compact' | 'comfortable' | 'spacious';
  accessibilityMode: boolean;
  userPreference: 'full' | 'subtle' | 'minimal';
}): MaterialAllocation {
  const base: MaterialAllocation = { paper: 60, metal: 25, wood: 10, glass: 4, fabric: 1 };

  if (context.performanceMode === 'low') {
    // Reduce complex materials (glass backdrop-filter, fabric patterns)
    return { paper: 70, metal: 20, wood: 8, glass: 1, fabric: 1 };
  }

  if (context.accessibilityMode) {
    // Maximize paper (highest contrast), minimize texture-heavy materials
    return { paper: 75, metal: 15, wood: 8, glass: 1, fabric: 1 };
  }

  if (context.interfaceDensity === 'compact') {
    // More paper/metal for dense UIs, less decorative materials
    return { paper: 65, metal: 25, wood: 7, glass: 2, fabric: 1 };
  }

  return base;
}
```

### 16.2 Performance Budget Enforcement

```typescript
// scripts/materialPerformanceBudget.ts

/**
 * Build-time performance budget validator for material system.
 * Integrated into CI/CD pipeline to catch performance regressions.
 */

export interface MaterialPerformanceBudget {
  maxGradientsPerElement: 3;
  maxBoxShadowLayers: 4;
  maxBackdropFilterElements: 10; // per visible page
  maxCSSCustomProperties: 200;
  maxTexturePatternSize: '2KB'; // estimated render cost per pattern
  targetFirstPaint: 100; // ms
  targetInteractionResponse: 50; // ms
  targetAnimationFPS: 60;
  maxBundleSizeIncrease: '15KB'; // from material CSS additions
}

/**
 * Runtime performance monitoring for material system.
 * Reports violations via analytics when performance budgets are exceeded.
 */
export class MaterialPerformanceObserver {
  // Monitors:
  // 1. CSS paint time for material-heavy components
  // 2. Frame drops during material animations
  // 3. Layout shift from material elevation changes
  // 4. Memory usage from backdrop-filter elements
  // Reports violations to analytics dashboard
}
```

### 16.3 CSS Performance Analysis Integration

```json
// package.json scripts for performance validation
{
  "scripts": {
    "perf:material-audit": "node scripts/materialPerformanceBudget.js --audit",
    "perf:gradient-count": "node scripts/materialPerformanceBudget.js --check-gradients",
    "perf:shadow-depth": "node scripts/materialPerformanceBudget.js --check-shadows",
    "perf:bundle-impact": "node scripts/materialPerformanceBudget.js --bundle-delta"
  }
}
```

## 17. Architecture Decision Records (ADR)

This section records key architectural decisions and their rationale for future reference.

### ADR-001: Wrap Radix Primitives, Don't Replace Them

**Decision**: Material components wrap Radix UI primitives rather than replacing them.
**Rationale**: Radix provides battle-tested accessibility (ARIA, focus management, keyboard nav). Reimplementing this is high-risk, low-value. Material styling is additive CSS; accessibility is structural HTML/JS.
**Consequence**: Every material component has a Radix dependency. This is acceptable — Radix is already a project dependency.

### ADR-002: CSS Tokens as Single Source of Truth

**Decision**: All material properties defined exclusively in `design-system/tokens/*.css`. No raw values in component files.
**Rationale**: Prevents token drift, enables theme switching via CSS custom property override, enables lint enforcement.
**Consequence**: Requires Stylelint CI gate. Developers must look up token names instead of using raw values.

### ADR-003: Feature-Flag Migration, Not Big-Bang

**Decision**: Each component migrates independently behind a feature flag using `withMaterialMigration()`.
**Rationale**: Allows per-component rollback, A/B testing, and gradual user exposure.
**Consequence**: Temporary code complexity from dual render paths. Cleaned up in Phase 5 (legacy deprecation).

### ADR-004: Standalone .design-system/ Deprecated

**Decision**: The standalone `.design-system/` Vite app is deprecated. The in-app `design-system/` directory is canonical.
**Rationale**: Two systems caused token drift (different font stacks, different color values). One source of truth is mandatory.
**Consequence**: Any unique patterns in `.design-system/` must be extracted to the canonical system before deletion.

### ADR-005: Material Identity Trumps Theme Color

**Decision**: Wood must look like wood in every theme. Theme influence is limited to tinting/staining, not replacement.
**Rationale**: Blue "wood" (#4682B4 in ocean theme) breaks the skeuomorphic metaphor entirely. Users cannot build a tactile mental model when materials don't look like their real-world counterparts.
**Constraint**: Wood hue MUST stay within warm brown range (hue 20°-45°, saturation 30%-80%). Metal MUST stay within gray/silver range (saturation < 20% unless copper/brass variant). Paper MUST stay within warm white/cream range (lightness > 85% in light mode, > 15% in dark mode).
**Corrected Values** (replacing violations found in audit):
- Ocean wood: `#4682B4` → `#7B5B3A` (salt-weathered driftwood)
- Lime wood: `#9ACD32` → `#7B6B2E` (sun-bleached willow)
- Neo wood: `#FF6347` → `#5C5050` (ebony-stained walnut)
- Forest wood: `#228B22` → `#6B4E2A` (forest floor walnut)
**Consequence**: Theme designers have constrained color ranges for material tokens. Creative expression happens through accent colors and non-material surfaces.

## 18. Implementation Readiness Summary

**Implementation Readiness Checklist:**
- ✅ 5-layer canonical architecture with dependency matrix and ESLint/Stylelint enforcement (Visual Architecture Decisions)
- ✅ Complete CSS design token system with 3-tier hierarchy (§2.1)
- ✅ Module-to-layer migration map for every codebase file (§1A)
- ✅ Per-component barrel-swap migration protocol with feature flags (§1.4, §9.2)
- ✅ TypeScript interfaces for every material component (§11)
- ✅ 9 screen specification matrices with per-zone material assignments (§1B)
- ✅ 6 canonical user flows with step-level intent → feedback → recovery contracts (§1C)
- ✅ Component state matrix: idle/loading/empty/error/success for 11 views (§1D)
- ✅ React ThemeProvider with FOUC prevention (§12)
- ✅ Radix UI integration wrappers (§13)
- ✅ Material physics and interaction patterns (§2.1.5)
- ✅ Accessibility validation suite — automated + manual (§15)
- ✅ Performance budgets with build-time and runtime enforcement (§16)
- ✅ 4-phase user onboarding and transition plan (§14)
- ✅ 8-week sprint implementation timeline (§9.1)
- ✅ Risk mitigation and rollback procedures (§7)
# Unified Application Design System

**Status:** Approved foundation  
**Reference:** MySmarty / SmartyD's all-in-one business dashboard and module hierarchy  
**Implementation target:** `24caresurat-gif/md-hygiene-social-manager`

## Product direction

Use one coherent, responsive design language across the entire application: Login, workspace selection, main dashboard, every business module, settings and public-facing tools. The reference informs the information architecture and interaction patterns; MD Hygiene keeps its own name, logo, content and brand assets.

## Application shell

- A compact, independently scrollable left navigation with grouped modules and a clear selected state.
- A consistent top bar with page title, workspace context, search/actions and account menu.
- A shared content canvas with a predictable page heading, description, primary action and responsive content width.
- Workspace identity and user controls remain visually consistent on every authenticated page.
- Mobile uses a drawer navigation with a backdrop; content must not overflow horizontally.

## Module hierarchy

Align navigation to the same business-first structure as the reference while preserving the existing product routes and permissions:

1. Home / Dashboard
2. Google Business and Reviews
3. Website / Digital Card
4. Catalogue and Menu
5. WhatsApp CRM and Communication
6. Orders and POS (show only routes/features that are implemented)
7. Loyalty (show only when implemented)
8. Smart QR (show only when implemented)
9. Social Publishing: Create Post, Creative Studio, Drafts, Calendar, Approvals, History and Media
10. Analytics
11. Workspace Settings and Connections

No menu item should imply that a feature is live when it is only planned. Keep Facebook, Instagram and Google connection setup in Settings as already agreed.

## Visual tokens

Use `app/design-system.css` as the source of truth for:
- Page background, surface and muted surface
- Primary teal, hover and soft accent
- Text, muted text and border colors
- Status colors for success, warning and errors
- Type scale, border radii, focus ring and elevation
- Standard control height and content width

Do not introduce new one-off colors, shadows, radii or button treatments in individual pages where a shared token exists.

## Shared page patterns

- **Page header:** eyebrow or breadcrumb, title, short description and one clear primary action.
- **Metric cards:** consistent label, value, context and optional trend; never invent live metrics.
- **Panels:** white surface, subtle border, shared radius and restrained shadow.
- **Tables/lists:** consistent row height, dividers, empty state, loading state and error handling.
- **Forms:** shared labels, spacing, control height, focus state, validation and disabled state.
- **Status:** neutral by default; semantic success/warning/error colors only when meaningful.
- **Empty/loading/error states:** use the same placement, typography and actions in every module.

## Responsive and accessibility rules

- Desktop: sidebar + top bar + centered content area.
- Tablet: fluid content grid and reduced page padding.
- Mobile: collapsible navigation drawer, single-column cards/forms and horizontally safe tables.
- Provide keyboard-visible focus, semantic headings/labels, sufficient contrast and clear disabled states.
- Respect reduced-motion preferences and avoid hover-only actions.

## Migration sequence

1. Foundation: centralize tokens and align Login + main Dashboard.
2. Shell: verify Sidebar, top bar, workspace selector and mobile drawer.
3. Module pages: migrate CRM, WhatsApp, Google Business, Catalogue, Digital Card, Settings and Publishing to the shared page/card/form/table patterns.
4. Public pages: align public Catalogue, Digital Card and Review Request pages without changing their customer-facing business logic.
5. QA: desktop/mobile browser pass, role-based visibility, workspace switching, empty/loading/error states and production build.

## Acceptance criteria

- No module has a visually unrelated header, sidebar, button system or form system.
- Every authenticated page uses the same shell and design tokens.
- All modules remain workspace-scoped and permission-filtered.
- Existing data flows, API calls, OAuth callbacks and RLS behavior are unchanged by visual work.
- No demo values are presented as real account data.
- Desktop and mobile navigation work without clipped or unreachable content.

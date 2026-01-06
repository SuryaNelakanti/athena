# Athena Frontend Architecture

## Overview
This is a React application built with Vite and Tailwind CSS. It interacts with the Athena backend via a REST API.

## Directory Structure (`src/`)

### `components/ui`
Reusable, atomic UI components. These should be "dumb" components that receive props.
- Examples: `Button`, `Badge`, `Card`, `Input`, `Modal`.
- **Rule**: Do not put page-specific logic here. Keep them generic.

### `features`
Self-contained feature modules that might span multiple components or have complex logic.
- Example: `run-narrative` (contains `RunNarrative.tsx`, `TimelineCard.tsx`, `RunGraph.tsx`).
- **Rule**: Use this for complex, domain-specific UI sections that act like mini-applications.

### `layouts`
High-level layout components.
- `Layout.tsx`: The main sidebar + content wrapper. Handles top-level navigation.
- `PageHeader.tsx`: Standard header for all pages. **MUST** be used for consistency.

### `lib`
Utilities and core infrastructure.
- `api.ts`: Centralized API client. All backend requests must go through here.
- `utils.ts`: Helper functions (clsx, formatting).

### `pages`
Top-level route components. These are the main views of the application.
- `RunDetail.tsx`, `TraceDetail.tsx`, `DatasetDetail.tsx`.
- **Rule**: Pages should coordinate data fetching and pass data down to components.

### `types.ts`
Centralized TypeScript definitions (interfaces/types) for the data model.
- `Trace`, `Span`, `Dataset`, `Experiment`, etc.

## Key Architectural Patterns

### Routing
The application uses a **custom hash-based router** implemented in `App.tsx`.
- `window.location.hash` determines the current view.
- `navigate(path, params)` helper in `App.tsx` handles transitions.
- **Note**: Ensure `App.tsx` handles new routes for any new pages created.

### Navigation Hierarchy
Navigation is strictly organized into three modes (Sidebar):
1.  **Observe**: Monitoring (Overview, Runs, Logs).
2.  **Improve**: Iteration (Review, Datasets, Experiments).
3.  **Operate**: Configuration (Proxy, Providers, Settings).

### Styling
- **Tailwind CSS**: Use utility classes for almost everything.
- **Design Tokens**: We use CSS variables for colors (defined in `index.html`).
    - `bg-app`: Main background.
    - `bg-panel`: Card/Section background.
    - `text-text-main` / `text-text-muted`: Typography.
    - `border-border-base` / `border-border-hairline`: Borders.

### Common Components
- **`PageHeader`**: Use for every page title. Supports `title`, `subtitle`, `badge`, `breadcumbs`, and `actions` (buttons).
- **`Modal`**: Standard dialog wrapper.
- **Icons**: `@heroicons/react/24/outline`.

## Development Workflow
1.  **New Feature**:
    *   Define types in `types.ts`.
    *   Add API methods to `lib/api.ts`.
    *   Create page in `pages/` (or feature in `features/` if complex).
    *   Add route handling in `App.tsx`.
    *   Add navigation item in `Layout.tsx` (if top-level).

2.  **Modifying UI**:
    *   Check `components/ui` for existing building blocks.
    *   Respect the 4pt grid system (`gap-1` = 4px).

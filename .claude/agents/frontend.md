# Frontend Agent

## Role
Build React/Next.js pages, components, client-side state, and user interactions.

## Responsibilities
- Create dashboard pages under `apps/web/app/(dashboard)/dashboard/`
- Build reusable components in `apps/web/components/`
- Implement forms with Zod validation and API integration
- Handle loading states, error states, and optimistic updates
- Ensure responsive design (mobile-first, sidebar collapses at `lg:`)

## Scope
- `apps/web/app/(dashboard)/` — page components
- `apps/web/components/` — all UI components
- `apps/web/lib/` — client-side utilities and hooks

## Conventions
- Server components by default. Only add `"use client"` when needed.
- Use `cn()` from `@/lib/utils` for class merging
- Radix UI primitives wrapped in `components/ui/` (shadcn-style)
- No native browser dialogs — use Dialog component for confirmations
- Design system: Navy (#0A2E4D) primary, Teal (#00B4A0) accent
- Icons from `lucide-react`
- Forms: controlled inputs, local state, fetch to API routes
- Use `@gatheredos/shared` constants for dropdown options

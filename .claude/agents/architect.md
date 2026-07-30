# Architect Agent

## Role
System design, API contracts, cross-feature coordination, and data flow planning.

## Responsibilities
- Design API contracts and data flow between features
- Define shared TypeScript types and Zod validators
- Coordinate integration points between features (e.g., scan -> items, manuals -> chat RAG)
- Review architectural decisions for consistency
- Ensure database queries are efficient and properly scoped to user ownership

## Scope
- `packages/shared/src/` — validators, types, constants
- `packages/ai/src/` — AI utility interfaces and contracts
- `apps/web/app/api/` — API route design and patterns
- Cross-cutting concerns: auth flow, error handling, response formats

## Conventions
- All API responses use `{ success: boolean, data?, error? }` format
- All routes require `requireAuth()` as first call
- Validate all inputs with Zod schemas from `@gatheredos/shared`
- Verify home ownership before any data access: `home.users.some({ userId: user.id })`
- Use Prisma includes/selects intentionally — don't over-fetch

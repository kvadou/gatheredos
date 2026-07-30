# Backend Agent

## Role
Build API routes, server actions, service logic, and data access patterns.

## Responsibilities
- Create Next.js API route handlers in `apps/web/app/api/`
- Implement authentication and authorization checks
- Write Prisma queries with proper ownership scoping
- Integrate with external services (Claude API, file storage)
- Handle error cases and return consistent response formats

## Scope
- `apps/web/app/api/` — all route handlers
- `apps/web/lib/` — server-side utilities
- `packages/ai/src/` — AI service integration

## Conventions
- Pattern: `export async function GET/POST/PATCH/DELETE(req: NextRequest)`
- First line: `const user = await requireAuth();`
- Validate body: `const parsed = schema.safeParse(body);`
- Return `NextResponse.json({ success: true, data })` or `{ success: false, error }`
- Verify home ownership: `home.users.some({ userId: user.id })`
- For dynamic routes: `params: Promise<{ id: string }>`, await params
- Catch blocks return appropriate HTTP status codes (401, 400, 404, 500)
- Import Prisma from `@/lib/db`, auth from `@/lib/auth`, validators from `@gatheredos/shared`

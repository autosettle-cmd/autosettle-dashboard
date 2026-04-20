# Platform Owner Portal

Separate portal for super-admin (role: `platform_owner`). Uses `PlatformSidebar.tsx` with its own nav. Not accessible to accountant/admin/employee roles.

---

## Pages

### Dashboard (`/platform/dashboard`)
Overview of the entire platform:

| Metric | What it shows |
|--------|--------------|
| Firm counts | Total, active, inactive |
| User counts | Total, by role (accountant, admin, employee, platform_owner) |
| Monthly activity | Claims, invoices, journal entries (this month vs all-time) |
| Upload volume chart | Last 30 days, stacked area (claims, invoices, statements by day) |
| OCR confidence | Pie charts for HIGH/MEDIUM/LOW on claims and invoices |
| OCR log stats | Total runs, success rate, average processing time (ms) |
| Workflow pipeline | Stacked bar: Pending Review → Reviewed → Approved → Paid |
| Bank recon health | Pie chart: matched/unmatched/excluded, match rate % |
| Firms table | Firm name, user count, employee count, claims, invoices, JVs |
| Recent firms | 5 most recently created firms |

### Firms (`/platform/firms`)
List of all firms with counts and assigned accountants.

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/platform/analytics` | GET | All dashboard metrics + chart data |
| `/api/platform/firms` | GET | List all firms with counts + assigned accountants |
| `/api/platform/firms` | POST | Create firm (optional: seed COA, create FY, assign accountants) |
| `/api/platform/users` | GET | List all users, filterable by role |

All routes require `platform_owner` role.

---

## Key Files

| File | Role |
|------|------|
| `app/platform/dashboard/page.tsx` | Dashboard with charts and metrics |
| `components/PlatformSidebar.tsx` | Separate sidebar (Dashboard + Firms nav) |
| `app/api/platform/analytics/route.ts` | Aggregation queries for all metrics |
| `app/api/platform/firms/route.ts` | Firm CRUD with optional seeding |
| `app/api/platform/users/route.ts` | User listing by role |

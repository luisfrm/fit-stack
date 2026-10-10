> **Alcance:** modelo de datos y vistas de Staff & Trainers.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

### 3. Staff & Trainers Architecture

**Data model:**

- `gym_member` (base table) — all gym members: clients, staff, trainers
- `coach_profile` (extension) — optional 1:1 for gym_members with role `COACH`. Fields: `specialities`, `bio`, `isVisible`, `displayOrder`
- `auth_member` — Better Auth membership linking user ↔ organization with role (`OWNER`, `MANAGER`, `CASHIER`, `COACH`, `MEMBER`)
- `coach_assignment` — links a coach (gym_member) to a client (gym_member)

**Staff (`/dashboard/staff`):**

- Table view for gym_members with roles: Owner, Manager, Cashier, Coach
- Components: `StaffTable`, `StaffModal`, `StaffForm` (`apps/panel/components/staff/`)
- Columns: Avatar+Name, Email, Role, Status, Actions
- Service: `membersService` (shared with Members module)

**Trainers (`/dashboard/trainers`):**

- Table view for gym_members with role `COACH` that have a `coach_profile`
- Components: `TrainersTable`, `TrainerModal`, `TrainerForm` (`apps/panel/components/trainers/`)
- Fields: name, photo, specialities, bio, visibility toggle, display order
- Service: `trainersService` (joins gym_member + coach_profile)
- API routes: `/api/trainers`

**Note**: Trainers appear in both views (staff table + trainers table) because they are gym_members with role `COACH`.

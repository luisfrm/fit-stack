import { Plus } from "lucide-react";
import { Button } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { updateTag } from "next/cache";
import { staffService } from "@/lib/services/staff-service";
import { StaffModal } from "@/components/staff/staff-modal";
import { StaffSidePanel } from "@/components/staff/staff-side-panel";
import { StaffClient } from "@/components/staff/staff-client";

export const dynamic = "force-dynamic";

const STAFF_ROLES = new Set(["owner", "admin", "support"]);

export default async function StaffPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ role?: string; search?: string }>;
}>) {
  const params = await searchParams;
  const role =
    params.role && STAFF_ROLES.has(params.role) ? params.role : undefined;
  const search = params.search || undefined;

  // Tabla filtrada + panel lateral con el equipo completo (conteos globales).
  const [staff, allStaff] = await Promise.all([
    staffService.getAll(
      { role, search },
      { next: { revalidate: 60, tags: ["console:staff"] } },
    ),
    staffService.getAll(undefined, {
      next: { revalidate: 60, tags: ["console:staff"] },
    }),
  ]);

  const refreshStaff = async () => {
    "use server";
    updateTag("console:staff");
  };

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader
        title="Staff"
        description="Equipo de administración de la plataforma SaaS Fit-Stack."
        iconName="Users"
      >
        <StaffModal
          onSuccess={refreshStaff}
          trigger={
            <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
              AGREGAR ADMIN
            </Button>
          }
        />
      </DashboardHeader>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div id="staff-table" className="lg:col-span-3 min-w-0">
          <StaffClient
            staff={staff}
            initialQuery={search ?? ""}
            initialRole={role ?? null}
            onSuccess={refreshStaff}
          />
        </div>
        <StaffSidePanel staff={allStaff} />
      </div>
    </div>
  );
}

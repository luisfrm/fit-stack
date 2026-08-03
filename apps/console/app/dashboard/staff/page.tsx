import { Plus, Users } from "lucide-react";
import { Button, Text } from "@workspace/ui/components";
import { DashboardHeader } from "@workspace/ui/components/dashboard-header";
import { updateTag } from "next/cache";
import { staffService } from "@/lib/services/staff-service";
import { StaffTable } from "@/components/staff/staff-table";
import { StaffModal } from "@/components/staff/staff-modal";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const staff = await staffService.getAll({
    next: { revalidate: 60, tags: ["console:staff"] },
  });

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

      <div className="bg-white/5 border border-white/5 p-5 rounded-2xl flex items-center justify-between">
        <div>
          <Text size="xs" variant="muted" className="uppercase font-black tracking-widest leading-none mb-1">
            Total Staff
          </Text>
          <Text size="lg" weight="bold" className="text-white">
            {staff.length}
          </Text>
        </div>
        <div className="p-3 bg-primary/10 rounded-xl text-primary">
          <Users size={20} />
        </div>
      </div>

      <StaffTable staff={staff} onSuccess={refreshStaff} />
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Edit2, Globe, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Table, type ColumnDef } from "@workspace/ui/components/table";
import { Badge } from "@workspace/ui/components/badge";
import { toast } from "@workspace/ui/components";
import { useRouter } from "next/navigation";
import { contentService } from "@/lib/services/content-service";
import type { IContentPage } from "@/types/content";
import { PageCreationModal } from "@/components/content/page-creation-modal";

interface ContentListClientProps {
  readonly initialPages: IContentPage[];
}

export function ContentListClient({ initialPages }: ContentListClientProps) {
  const router = useRouter();
  const [pages, setPages] = React.useState<IContentPage[]>(initialPages);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  React.useEffect(() => {
    setPages(initialPages);
  }, [initialPages]);

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar esta página? Se borrarán todos sus bloques.")) return;
    setDeletingId(id);
    try {
      await contentService.deletePage(id);
      toast.success("Página eliminada");
      router.refresh();
    } catch (error) {
      console.error("Error deleting page:", error);
      toast.error("Error al eliminar la página");
    } finally {
      setDeletingId(null);
    }
  };

  const columns: ColumnDef<IContentPage>[] = [
    {
      header: "Título",
      className: "pl-6",
      cell: (page) => (
        <div className="flex flex-col">
          <Text weight="bold">{page.title}</Text>
          <Text variant="muted" size="xs">{page.slug}</Text>
        </div>
      ),
    },
    {
      header: "Estado",
      cell: (page) => (
        <Badge variant={page.isActive ? "default" : "secondary"}>
          {page.isActive ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
          {page.isActive ? "Activa" : "Borrador"}
        </Badge>
      ),
    },
    {
      header: "Última Modificación",
      cell: (page) => (
        <Text variant="muted" size="sm">
          {page.updatedAt ? new Date(page.updatedAt).toLocaleDateString() : "—"}
        </Text>
      ),
    },
    {
      header: "Acciones",
      className: "text-right pr-6",
      cell: (page) => (
        <div className="flex justify-end gap-2">
          <Link href={`/content/${page.id}`}>
            <Button variant="ghost" size="sm" leftIcon={<Edit2 size={16} />}>
              Editar
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
            onClick={() => handleDelete(page.id)}
            disabled={deletingId === page.id}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center animate-in fade-in slide-in-from-top-2 duration-500">
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-slate-100">Gestión de Contenido</h2>
          <Text variant="muted">Administra las páginas y secciones de tu sitio web.</Text>
        </div>
        <PageCreationModal
          onSuccess={() => router.refresh()}
          trigger={
            <Button variant="primary" leftIcon={<Plus size={18} />}>
              Nueva Página
            </Button>
          }
        />
      </header>

      <Card className="bg-white/5 border-none backdrop-blur-md rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500 delay-75">
        {pages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500">
            <Globe className="w-12 h-12 opacity-20 animate-in fade-in zoom-in-50 duration-500" />
            <Text className="animate-in fade-in duration-500 delay-100">No hay páginas creadas aún.</Text>
            <div className="animate-in fade-in duration-500 delay-150">
              <PageCreationModal
                onSuccess={() => router.refresh()}
                trigger={<Button variant="outlined" size="sm">Crear mi primera página</Button>}
              />
            </div>
          </div>
        )}
        {pages.length > 0 && (
          <Table columns={columns} data={pages} loading={false} />
        )}
      </Card>
    </div>
  );
}

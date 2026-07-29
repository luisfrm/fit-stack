"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Edit2, Globe, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Table, type ColumnDef } from "@workspace/ui/components/table";
import { Badge } from "@workspace/ui/components/badge";
import { toast, Modal } from "@workspace/ui/components";
import { useRouter } from "next/navigation";
import { Input } from "@workspace/ui/components/input";
import { contentService } from "@/lib/services/content-service";
import type { IContentPage } from "@/types/content";

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
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        "Error al eliminar la página";
      toast.error(message);
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
          <Link href={`/dashboard/content/${page.id}`}>
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
    <div className="space-y-8">
      <header className="flex justify-between items-center">
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

      <Card className="bg-white/5 border-none backdrop-blur-md rounded-xl overflow-hidden">
        {pages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500">
            <Globe className="w-12 h-12 opacity-20" />
            <Text>No hay páginas creadas aún.</Text>
            <PageCreationModal
              onSuccess={() => router.refresh()}
              trigger={<Button variant="outlined" size="sm">Crear mi primera página</Button>}
            />
          </div>
        )}
        {pages.length > 0 && (
          <Table columns={columns} data={pages} loading={false} />
        )}
      </Card>
    </div>
  );
}

function PageCreationModal({
  trigger,
  onSuccess,
}: {
  readonly trigger: React.ReactNode;
  readonly onSuccess: () => void;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");

  const generateSlug = (text: string) => {
    const baseSlug = text
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/(^-+|-+)+/g, "");
    return `/${baseSlug}`;
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (!slug || slug === generateSlug(title)) {
      setSlug(generateSlug(newTitle));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newSlug = e.target.value.toLowerCase();

    if (newSlug === "") {
      setSlug("/");
      return;
    }

    if (!newSlug.startsWith("/")) {
      newSlug = "/" + newSlug;
    }
    newSlug = newSlug.replaceAll(/\s+/g, "-").replaceAll(/\/+/g, "/");
    setSlug(newSlug);
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!title || !slug) {
      toast.error("El título y el slug son obligatorios");
      return;
    }

    try {
      setIsSubmitting(true);
      const newPage = await contentService.createPage({
        title,
        slug,
        description,
        isActive: false,
      });
      toast.success("Página creada con éxito");
      setIsOpen(false);
      onSuccess();
      router.push(`/dashboard/content/${newPage.id}`);
    } catch (error) {
      const message =
        (error as { data?: { error?: string }; message?: string }).data?.error ??
        "Error al crear la página";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      title="Añadir Nueva Página"
      description="Completa los datos para crear una nueva página en el sistema."
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <Input
          label="Título de la Página"
          placeholder="ej. Nosotros"
          value={title}
          onChange={handleTitleChange}
          required
        />
        <Input
          label="Slug (URL)"
          placeholder="/ (para la página de inicio)"
          value={slug}
          onChange={handleSlugChange}
          required
        />
        <Input
          label="Descripción (Opcional)"
          placeholder="Breve resumen de la página..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex justify-end gap-2 pt-4 border-t border-white/5">
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>Crear Página</Button>
        </div>
      </form>
    </Modal>
  );
}

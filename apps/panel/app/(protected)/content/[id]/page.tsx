"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Settings,
  Search,
  LayoutList,
  Loader2,
} from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Switch } from "@workspace/ui/components/switch";
import { Badge } from "@workspace/ui/components/badge";
import { toast } from "@workspace/ui/components";

import { contentService } from "@/lib/services/content-service";
import { IContentPage } from "@/types/content";

/** Normaliza un slug de página: minúsculas, espacios → guiones, `/` simple. */
function normalizeSlug(value: string): string {
  let slug = value.toLowerCase();
  if (slug === "") return "/";
  if (!slug.startsWith("/")) slug = "/" + slug;
  return slug.replaceAll(/\s+/g, "-").replaceAll(/\/+/g, "/");
}

/** Convierte strings vacíos a null para limpiar campos opcionales en la API. */
function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export default function CMSPageConfig() {
  const params = useParams();
  const router = useRouter();
  const pageId = Number(params.id);

  const [page, setPage] = React.useState<IContentPage | null>(null);
  const [blockCount, setBlockCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  // ── Form state ──
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [metaTitle, setMetaTitle] = React.useState("");
  const [metaDescription, setMetaDescription] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);

  const fetchPage = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const [pageData, blocksData] = await Promise.all([
        contentService.getPage(pageId),
        contentService.getBlocks(pageId),
      ]);
      setPage(pageData);
      setTitle(pageData.title);
      setSlug(pageData.slug);
      setDescription(pageData.description ?? "");
      setMetaTitle(pageData.metaTitle ?? "");
      setMetaDescription(pageData.metaDescription ?? "");
      setIsActive(pageData.isActive);
      setBlockCount(blocksData.length);
    } catch (error: unknown) {
      toast.error("Error al cargar los datos de la página");
      console.error("Error al cargar los datos de la página", error);
      router.push("/content");
    } finally {
      setIsLoading(false);
    }
  }, [pageId, router]);

  React.useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlug(normalizeSlug(e.target.value));
  };

  const handleSave = async () => {
    if (!title.trim() || !slug.trim()) {
      toast.error("El título y el slug son obligatorios");
      return;
    }
    try {
      setIsSaving(true);
      const updated = await contentService.updatePage(pageId, {
        title: title.trim(),
        slug: slug.trim(),
        description: emptyToNull(description),
        metaTitle: emptyToNull(metaTitle),
        metaDescription: emptyToNull(metaDescription),
        isActive,
      });
      setPage(updated);
      toast.success("Configuración guardada correctamente.");
    } catch (error: unknown) {
      console.error("Error al guardar la configuración:", error);
      toast.error("Error al guardar la configuración");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-slate-500 animate-in fade-in duration-500">
        <Loader2 className="w-10 h-10 animate-spin" />
        <Text>Cargando configuración de página...</Text>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      {/* ── Top Bar ── */}
      <header className="flex justify-between items-center bg-background/80 backdrop-blur-md sticky top-0 z-20 py-4 -mx-4 px-4 sm:px-8 border-b border-border-dark lg:border-none lg:bg-transparent">
        <div className="flex items-center gap-4">
          <Link href="/content">
            <Button variant="ghost" size="sm" className="hidden sm:flex">
              <ArrowLeft size={18} className="mr-2" /> Atrás
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <h2 className="text-xl lg:text-2xl font-bold text-slate-100">{page?.title}</h2>
            <Badge variant={page?.isActive ? "default" : "secondary"}>
              {page?.isActive ? "Activa" : "Borrador"}
            </Badge>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href={`/content/${pageId}/blocks`}>
            <Button variant="glass" size="sm" leftIcon={<LayoutList size={18} />}>
              Ver Bloques{blockCount > 0 ? ` (${blockCount})` : ""}
            </Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Save size={18} />}
            onClick={handleSave}
            loading={isSaving}
          >
            Guardar Cambios
          </Button>
        </div>
      </header>

      {/* ── Configuración General ── */}
      <section className="space-y-6">
        <Text as="p" weight="bold" size="lg" className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" /> Configuración de Página
        </Text>

        <Card className="bg-white/5 border-none p-6">
          <div className="flex flex-row flex-wrap gap-6">
            <div className="flex-1 min-w-[260px]">
              <Input
                label="Título de la Página"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[260px]">
              <Input
                label="Slug (URL pública)"
                value={slug}
                onChange={handleSlugChange}
                hint={`URL pública: ...${slug === "/" ? "" : slug}`}
              />
            </div>
          </div>

          <div className="mt-6">
            <Textarea
              label="Descripción"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              hint="Resumen breve de la página. Se usa como meta description cuando no hay una específica."
            />
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
            <div>
              <Text weight="semibold" size="sm">Publicar página</Text>
              <Text variant="muted" size="xs">
                Las páginas en borrador no se muestran en el sitio público.
              </Text>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </Card>
      </section>

      {/* ── SEO ── */}
      <section className="space-y-6">
        <Text as="p" weight="bold" size="lg" className="flex items-center gap-2">
          <Search className="w-5 h-5 text-primary" /> SEO (Metadatos)
        </Text>

        <Card className="bg-white/5 border-none p-6">
          <div className="flex flex-row flex-wrap gap-6">
            <div className="flex-1 min-w-[260px]">
              <Input
                label="Meta Título"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                hint="Título para los resultados de búsqueda. Vacío = usa el título de la página."
              />
            </div>
            <div className="flex-1 min-w-[260px]">
              <Input
                label="Canonical"
                value={slug === "/" ? "/" : slug}
                disabled
                hint="Se genera automáticamente desde el slug y el dominio del sitio."
              />
            </div>
          </div>

          <div className="mt-6">
            <Textarea
              label="Meta Descripción"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              hint="Descripción mostrada en Google y redes sociales (ideal 120–160 caracteres)."
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
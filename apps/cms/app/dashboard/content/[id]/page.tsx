"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Settings, 
  Grid, 
  Eye, 
  EyeOff, 
  GripVertical, 
  Trash2, 
  Loader2 
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { Text } from "@workspace/ui/components/text";
import { Input } from "@workspace/ui/components/input";
import { Badge } from "@workspace/ui/components/badge";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@workspace/ui/components/accordion";
import { toast, Modal } from "@workspace/ui/components";

import { cmsContentService } from "@/lib/services/cms-content-service";
import { ICmsPage, ICmsBlock, CmsBlockType } from "@/types/cms";
import { cn } from "@workspace/ui/lib/utils";

// Mock de tipos de bloques permitidos (en un futuro esto viene del backend o config compartida)
const BLOCK_TYPES: { type: CmsBlockType; label: string; description: string }[] = [
  { type: 'hero',         label: 'Sección Hero',     description: 'Banner principal con título e imagen' },
  { type: 'services',     label: 'Nuestros Servicios',description: 'Cuadrícula de servicios con iconos' },
  { type: 'classes_info', label: 'Info de Clases',   description: 'Título y botón para sección de clases' },
  { type: 'testimonials', label: 'Testimonios',      description: 'Reseñas de clientes y estrellas' },
  { type: 'gallery',      label: 'Galería',          description: 'Malla de imágenes con descripción' },
  { type: 'contact',      label: 'Contacto',         description: 'Formulario, mapa y redes sociales' },
  { type: 'team_info',    label: 'Info de Equipo',   description: 'Título para el staff de entrenadores' },
];

export default function CMSPageEditor() {
  const params = useParams();
  const router = useRouter();
  const [page, setPage] = React.useState<ICmsPage | null>(null);
  const [blocks, setBlocks] = React.useState<ICmsBlock[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUpdatingMeta, setIsUpdatingMeta] = React.useState(false);
  
  // States for page configuration
  const [metaTitle, setMetaTitle] = React.useState("");
  const [metaSlug, setMetaSlug] = React.useState("");

  const fetchPageAndBlocks = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const pageId = Number(params.id);
      const [pageData, blocksData] = await Promise.all([
        cmsContentService.getPage(pageId),
        cmsContentService.getBlocks(pageId)
      ]);
      setPage(pageData);
      setMetaTitle(pageData.title);
      setMetaSlug(pageData.slug);
      setBlocks(blocksData);
    } catch (error: any) {
      toast.error("Error al cargar los datos del editor");
      console.error("Error al cargar los datos del editor",error);
      router.push("/dashboard/content");
    } finally {
      setIsLoading(false);
    }
  }, [params.id, router]);

  React.useEffect(() => {
    fetchPageAndBlocks();
  }, [fetchPageAndBlocks]);

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newSlug = e.target.value.toLowerCase();
    if (newSlug === "") {
      setMetaSlug("/");
      return;
    }
    if (!newSlug.startsWith("/")) {
      newSlug = "/" + newSlug;
    }
    newSlug = newSlug.replaceAll(/\s+/g, '-').replaceAll(/\/+/g, '/');
    setMetaSlug(newSlug);
  };

  const handleUpdateMetadata = async () => {
    if (!metaTitle || !metaSlug) {
      toast.error("El título y el slug son obligatorios");
      return;
    }
    try {
      setIsUpdatingMeta(true);
      const updated = await cmsContentService.updatePage(Number(params.id), {
        title: metaTitle,
        slug: metaSlug
      });
      setPage(updated);
      toast.success("Metadatos guardados correctamente.");
    } catch (error: any) {
      toast.error("Error al actualizar metadatos", { description: error.message });
    } finally {
      setIsUpdatingMeta(false);
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(blocks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    
    if (reorderedItem) {
      items.splice(result.destination.index, 0, reorderedItem);
  
      // Actualizar displayOrder localmente
      const updatedBlocks = items.map((item, index) => ({
        ...item,
        displayOrder: index
      }));
      setBlocks(updatedBlocks);
    }
  };

  const handleSaveOrder = async () => {
    if (!page) return;
    try {
      setIsSaving(true);
      await cmsContentService.reorderBlocks(page.id, blocks.map(b => ({
        id: b.id,
        displayOrder: b.displayOrder
      })));
      toast.success("Orden guardado correctamente");
    } catch (error: any) {
      toast.error("Error al guardar el nuevo orden");
      console.error("Error al guardar el nuevo orden",error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBlock = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este bloque?")) return;
    try {
      await cmsContentService.deleteBlock(id);
      toast.success("Bloque eliminado");
      fetchPageAndBlocks();
    } catch (error: any) {
      console.error("Error al eliminar el bloque", error);
      toast.error("Error al eliminar el bloque");
    }
  };

  const handleToggleVisibility = async (block: ICmsBlock) => {
    try {
      await cmsContentService.updateBlock(block.id, { isVisible: !block.isVisible });
      fetchPageAndBlocks();
    } catch (error: any) {
      console.error("Error al cambiar visibilidad", error);
      toast.error("Error al cambiar visibilidad");
    }
  };

  if (isLoading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-slate-500">
        <Loader2 className="w-10 h-10 animate-spin" />
        <Text>Cargando editor de página...</Text>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* ── Top Bar ── */}
      <header className="flex justify-between items-center bg-background/80 backdrop-blur-md sticky top-0 z-20 py-4 -mx-4 px-4 sm:px-8 border-b border-border-dark lg:border-none lg:bg-transparent">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/content">
            <Button variant="ghost" size="sm" className="hidden sm:flex">
                <ArrowLeft size={18} className="mr-2" /> Atrás
            </Button>
          </Link>
          <div className="flex items-center gap-2">
                 <h2 className="text-xl lg:text-2xl font-bold text-slate-100">{page?.title}</h2>
                 <Badge variant={page?.isActive ? "default" : "secondary"}>{page?.isActive ? "Activa" : "Borrador"}</Badge>
          </div>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="glass" 
            size="sm" 
            leftIcon={<Save size={18} />} 
            onClick={handleSaveOrder}
            loading={isSaving}
          >
            Guardar Orden
          </Button>
          <BlockCreationModal 
            pageId={Number(params.id)} 
            onSuccess={fetchPageAndBlocks} 
            currentBlockCount={blocks.length}
            trigger={
              <Button variant="primary" size="sm" leftIcon={<Plus size={18} />}>
                Nuevo Bloque
              </Button>
            }
          />
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* ── Page Config ── */}
        <section className="space-y-6">
          <Text as="p" weight="bold" size="lg" className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" /> Configuración de Página
          </Text>
          <Card className="bg-white/5 border-none p-6 space-y-6">
            <Input 
              label="Título de la Página" 
              value={metaTitle} 
              onChange={(e) => setMetaTitle(e.target.value)} 
            />
            <Input 
              label="Slug (URL)" 
              value={metaSlug} 
              onChange={handleSlugChange} 
            />
            <div className="pt-4 border-t border-white/5 flex justify-end">
               <Button 
                variant="glass" 
                size="sm" 
                onClick={handleUpdateMetadata}
                loading={isUpdatingMeta}
               >
                 Actualizar Metadatos
               </Button>
            </div>
          </Card>
        </section>

        {/* ── Content Blocks (DND) ── */}
        <section className="xl:col-span-2 space-y-6">
          <Text as="p" weight="bold" size="lg" className="flex items-center gap-2">
            <Grid className="w-5 h-5 text-primary" /> Bloques de Contenido
          </Text>

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="blocks">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                  {blocks.length === 0 ? (
                    <Card className="bg-white/5 border-dashed border-white/10 p-12 text-center">
                       <Text variant="muted">Esta página no tiene bloques configurados.</Text>
                       <BlockCreationModal 
                         pageId={Number(params.id)} 
                         onSuccess={fetchPageAndBlocks} 
                         currentBlockCount={0}
                         trigger={
                           <Button variant="outlined" size="sm" className="mt-4">
                             Agregar mi primer bloque
                           </Button>
                         }
                       />
                    </Card>
                  ) : (
                    blocks.map((block, index) => (
                      <DraggableBlock 
                        key={block.id} 
                        block={block} 
                        index={index} 
                        onDelete={handleDeleteBlock}
                        onToggleVisibility={handleToggleVisibility}
                        refresh={fetchPageAndBlocks}
                      />
                    ))
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTS (Refactored to reduce nesting)
   ───────────────────────────────────────────── */

interface DraggableBlockProps {
  readonly block: ICmsBlock;
  readonly index: number;
  readonly onDelete: (id: number) => void;
  readonly onToggleVisibility: (block: ICmsBlock) => void;
  readonly refresh: () => void;
}

function DraggableBlock({ block, index, onDelete, onToggleVisibility, refresh }: DraggableBlockProps) {
  return (
    <Draggable draggableId={String(block.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "group transition-all duration-200",
            snapshot.isDragging && "scale-[1.02] shadow-2xl z-50 ring-2 ring-primary/50"
          )}
        >
          <Card className="bg-white/5 border-none overflow-hidden relative">
            <div className="flex">
              {/* DND Handle */}
              <div 
                {...provided.dragHandleProps} 
                className="w-10 bg-background flex items-center justify-center hover:bg-zinc-900 transition-colors cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-4 h-4 text-slate-500" />
              </div>
              
              {/* Accordion / Editor */}
              <div className="flex-1">
                <Accordion type="single" collapsible>
                  <AccordionItem value="item-1" className="border-none">
                    <div className="flex items-center justify-between pr-4">
                      <AccordionTrigger className="flex-1 py-4 hover:no-underline text-left">
                          <div className="flex items-center gap-3 w-full">
                            <Badge variant="outline" className="uppercase text-[10px] bg-slate-500/10 border-slate-500/20">
                              {block.blockType}
                            </Badge>
                            <Text weight="semibold" variant={block.isVisible ? "default" : "muted"}>
                                {BLOCK_TYPES.find(t => t.type === block.blockType)?.label || block.blockType}
                            </Text>
                          </div>
                      </AccordionTrigger>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleVisibility(block);
                          }}
                        >
                          {block.isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-rose-500 hover:text-rose-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(block.id);
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                    <AccordionContent className="p-6 bg-black/20 border-t border-white/5">
                        <BlockDataForm 
                          block={block} 
                          onSuccess={refresh} 
                        />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Draggable>
  );
}


function BlockCreationModal({ 
  pageId, 
  onSuccess, 
  currentBlockCount, 
  trigger
}: { 
  readonly pageId: number, 
  readonly onSuccess: () => void, 
  readonly currentBlockCount: number,
  readonly trigger: React.ReactNode
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleCreate = async (type: CmsBlockType) => {
    try {
      setIsSubmitting(true);
      await cmsContentService.createBlock(pageId, {
        blockType: type,
        data: { title: "Nuevo Bloque" }, // Pass a base valid structure for Zod
        displayOrder: currentBlockCount // Al final de la lista
      });
      toast.success(`Bloque ${type} añadido`);
      setIsOpen(false);
      onSuccess();
    } catch (error: any) {
      toast.error("Error al crear bloque");
      console.error("Error al crear bloque",error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      trigger={trigger}
      title="Añadir Nuevo Bloque de Contenido"
      open={isOpen}
      onOpenChange={setIsOpen}
      size="2xl"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
        {BLOCK_TYPES.map((block) => (
          <button
            key={block.type}
            onClick={() => handleCreate(block.type)}
            disabled={isSubmitting}
            className="flex items-start gap-4 p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-primary/30 text-left transition-all group disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
               <Grid size={20} />
            </div>
            <div className="flex-1">
               <Text weight="bold" size="sm" className="mb-0.5">{block.label}</Text>
               <Text variant="muted" size="xs">{block.description}</Text>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

import { BlockDataForm } from "@/components/content/block-forms";import Link from "next/link";


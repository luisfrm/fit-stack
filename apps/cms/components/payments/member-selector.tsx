"use client";

import * as React from "react";
import { Search, X, CircleX } from "lucide-react";
import { 
  Input, 
  Button, 
  Label 
} from "@workspace/ui/components";
import { type IMember } from "@/types/dashboard";

interface MemberSelectorProps {
  readonly selectedMember: IMember | null;
  readonly memberSearch: string;
  readonly isSearching: boolean;
  readonly searchResults: IMember[];
  readonly debouncedSearch: string;
  readonly onSearchChange: (value: string) => void;
  readonly onSelectMember: (member: IMember) => void;
  readonly onClearMember: () => void;
  readonly onClearSearch: () => void;
  readonly onAddMemberClick?: (query: string) => void;
}

export function MemberSelector({
  selectedMember,
  memberSearch,
  isSearching,
  searchResults,
  debouncedSearch,
  onSearchChange,
  onSelectMember,
  onClearMember,
  onClearSearch,
  onAddMemberClick,
}: MemberSelectorProps) {
  return (
    <div className="space-y-2 relative">
      <Label id="member-search-label" className="text-sm font-medium">
        {selectedMember ? "Miembro Seleccionado" : "Buscar Miembro"}
      </Label>

      {selectedMember ? (
        <div className="p-4 rounded-xl border border-white/10 bg-white/2 flex items-center justify-between group animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-white uppercase tracking-tight leading-none">
              {selectedMember.firstName} {selectedMember.lastName}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 uppercase">
                {selectedMember.documentId}
              </span>
              <span className="text-xs text-slate-400 font-medium">{selectedMember.email}</span>
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClearMember}
            className="hover:bg-red-500/10 hover:text-red-500 rounded-lg h-9 w-9 transition-colors"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              id="member-search"
              placeholder="Escribe el nombre, email o DNI..."
              value={memberSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
              state={isSearching ? "loading" : "default"}
              autoComplete="off"
              aria-labelledby="member-search-label"
              rightElement={memberSearch && (
                <Button
                  type="button"
                  variant="ghost-danger"
                  size="xs"
                  rounded="full"
                  onClick={onClearSearch}
                  className="h-7 w-7 p-0"
                  title="Limpiar búsqueda"
                >
                  <CircleX size={16} />
                </Button>
              )}
            />
          </div>

          {debouncedSearch && !isSearching && (
            <div className="absolute z-50 w-full bg-zinc-950 border border-white/10 rounded-xl overflow-hidden shadow-2xl mt-1 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
              {searchResults.length > 0 ? (
                <>
                  {searchResults.map(member => (
                    <Button
                      asChild
                      key={member.id}
                      variant="ghost"
                      fullWidth
                      className="text-left px-4 py-3 h-auto flex flex-col items-start transition-colors border-b border-white/5 last:border-0 rounded-none bg-transparent hover:bg-white/5 active:bg-white/10"
                    >
                      <button type="button" onClick={() => onSelectMember(member)}>
                        <span className="text-sm font-semibold text-white">
                          {member.firstName} {member.lastName} {member.documentId ? `• ${member.documentId}` : ""}
                        </span>
                        <span className="text-xs text-slate-400">{member.email}</span>
                      </button>
                    </Button>
                  ))}

                  {onAddMemberClick && (
                    <div className="p-3 border-t border-white/5 bg-white/2">
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => onAddMemberClick(debouncedSearch)}
                        className="w-full text-[10px] items-center justify-center py-1 uppercase tracking-wider h-auto"
                      >
                        ¿No encuentras a quien buscabas? Crear nuevo miembro
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-6 flex flex-col items-center justify-center text-center gap-3">
                  <div className="size-12 rounded-full bg-white/5 flex items-center justify-center text-slate-500">
                    <Search size={24} className="opacity-20" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-300">Cliente no encontrado</p>
                    <p className="text-xs text-slate-500 italic">No hay resultados para "{debouncedSearch}"</p>
                  </div>
                  {onAddMemberClick && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onAddMemberClick(debouncedSearch)}
                      className="mt-2 text-primary hover:bg-primary/10 font-bold"
                    >
                      ¿DESEA CREAR UNO NUEVO?
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

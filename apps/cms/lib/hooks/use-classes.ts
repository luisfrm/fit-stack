"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { classesService, type ClassesFilter, type PaginatedClasses } from "../services/classes-service";
import { type ICmsClass, type IClassToday } from "@/types/dashboard";
import { toast } from "@workspace/ui/components";

export const classesKeys = {
  all: ["classes"] as const,
  lists: () => [...classesKeys.all, "list"] as const,
  list: (filters: ClassesFilter) => [...classesKeys.lists(), filters] as const,
  today: (date: string) => [...classesKeys.all, "today", date] as const,
};

export function useClasses(filters: ClassesFilter) {
  return useQuery<PaginatedClasses>({
    queryKey: classesKeys.list(filters),
    queryFn: () => classesService.getClasses(filters),
    staleTime: 1000 * 60 * 5,
  });
}

export function useTodayClasses(date: string) {
  return useQuery<IClassToday[]>({
    queryKey: classesKeys.today(date),
    queryFn: async () => {
      const raw = await classesService.getClassesByDate(date);
      const mapped: IClassToday[] = raw.map((cls) => ({
        id: cls.id,
        name: cls.name,
        startTime: cls.startTime,
        endTime: cls.endTime,
        trainerName: cls.trainerName,
        capacity: cls.capacity,
      }));
      return mapped.sort((a, b) => a.startTime.localeCompare(b.startTime));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateClass() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<ICmsClass>) => classesService.createClass(data),
    onSuccess: () => {
      toast.success("Clase creada correctamente");
      queryClient.invalidateQueries({ queryKey: classesKeys.all });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? error.message ?? "Error al crear la clase";
      toast.error(message);
    },
  });
}

export function useUpdateClass() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ICmsClass> }) =>
      classesService.updateClass(id, data),
    onSuccess: () => {
      toast.success("Clase actualizada correctamente");
      queryClient.invalidateQueries({ queryKey: classesKeys.all });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? error.message ?? "Error al actualizar la clase";
      toast.error(message);
    },
  });
}

export function useDeleteClass() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => classesService.deleteClass(id),
    onSuccess: () => {
      toast.success("Clase eliminada correctamente");
      queryClient.invalidateQueries({ queryKey: classesKeys.all });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? error.message ?? "Error al eliminar la clase";
      toast.error(message);
    },
  });
}

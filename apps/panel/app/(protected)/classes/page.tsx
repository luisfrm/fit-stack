import { classesService } from "@/lib/services/classes-service";
import { ClassesClient } from "./classes-client";
import { sessionService } from "@/lib/services/session-service";
import { resolveWeekAnchor, expandWeek } from "@/lib/classes/week-calendar";
import { countVisibility } from "@/lib/classes/class-summary-selectors";
import { addLocalDays, toLocalDayString } from "@workspace/shared/date";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;
const CALENDAR_LIMIT = 200;

const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
] as const;

function formatWeekLabel(start: string, end: string): string {
  const [, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const startMonth = MONTHS_SHORT[(sm ?? 1) - 1];
  const endMonth = MONTHS_SHORT[(em ?? 1) - 1];
  if (sm === em) return `${sd} – ${ed} de ${endMonth} de ${ey}`;
  return `${sd} de ${startMonth} – ${ed} de ${endMonth} de ${ey}`;
}

function withWeek(base: URLSearchParams, week: string | null): string {
  const params = new URLSearchParams(base);
  if (week) params.set("week", week);
  else params.delete("week");
  const qs = params.toString();
  return `/classes${qs ? `?${qs}` : ""}`;
}

export default async function ClassesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    query?: string;
    page?: string;
    isVisible?: string;
    week?: string;
  }>;
}>) {
  const params = await searchParams;
  const query = params.query || "";
  const page = Math.max(1, Number(params.page) || 1);
  const isVisibleParam = params.isVisible;
  let initialVisibility: "all" | "visible" | "hidden";
  if (isVisibleParam === "true") {
    initialVisibility = "visible";
  } else if (isVisibleParam === "false") {
    initialVisibility = "hidden";
  } else {
    initialVisibility = "all";
  }

  // Fetch session to determine active org ID for isolated cache tagging
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId;
  const orgTimezone = session?.activeOrganization?.timezone;
  const tag = `org:${activeOrgId}:classes`;
  const calendarTag = `org:${activeOrgId}:classes:calendar`;

  const filters: {
    name?: string;
    isVisible?: boolean;
    page: number;
    limit: number;
  } = {
    page,
    limit: PAGE_LIMIT,
  };
  if (query) filters.name = query;
  if (initialVisibility === "visible") filters.isVisible = true;
  if (initialVisibility === "hidden") filters.isVisible = false;

  // DOS fetches RSC con keys distintas: tabla paginada actual + calendario
  // completo (sin filtros de tabla). No se rompe lo existente.
  const [result, calendarResult] = await Promise.all([
    classesService.getClasses(filters, {
      next: { revalidate: 60, tags: [tag] },
    }),
    classesService
      .getClasses(
        { limit: CALENDAR_LIMIT },
        { next: { revalidate: 60, tags: [calendarTag] } },
      )
      .catch(() => ({ data: [], total: 0, page: 1, limit: CALENDAR_LIMIT, totalPages: 0 })),
  ]);

  const weekAnchor = resolveWeekAnchor(params.week, orgTimezone);
  const weekDays = expandWeek(calendarResult.data, weekAnchor, orgTimezone);
  const weekStart = weekDays[0]?.date ?? weekAnchor;
  const weekEnd = weekDays[6]?.date ?? weekAnchor;

  // C2: próxima clase de hoy + visibles/ocultas (sin backend, misma fuente).
  const todayLocal = toLocalDayString(orgTimezone);
  const todayOccurrences =
    expandWeek(calendarResult.data, todayLocal, orgTimezone).find((d) => d.date === todayLocal)
      ?.occurrences ?? [];
  const visibility = countVisibility(calendarResult.data);

  // `?week=` se fusiona con los filtros existentes, no los reemplaza.
  const preserved = new URLSearchParams();
  if (query) preserved.set("query", query);
  if (page !== 1) preserved.set("page", String(page));
  if (isVisibleParam === "true" || isVisibleParam === "false") {
    preserved.set("isVisible", isVisibleParam);
  }

  // Server Action to purge organization-specific classes cache tags
  const refreshClasses = async () => {
    "use server";
    updateTag(tag);
    updateTag(calendarTag);
  };

  return (
    <ClassesClient
      initialClasses={result}
      initialQuery={query}
      initialVisibility={initialVisibility}
      initialWeek={params.week ?? null}
      weekDays={weekDays}
      weekLabel={formatWeekLabel(weekStart, weekEnd)}
      prevWeekUrl={withWeek(preserved, addLocalDays(orgTimezone, weekAnchor, -7))}
      nextWeekUrl={withWeek(preserved, addLocalDays(orgTimezone, weekAnchor, 7))}
      todayUrl={withWeek(preserved, null)}
      todayOccurrences={todayOccurrences}
      visibleCount={visibility.visible}
      hiddenCount={visibility.hidden}
      timezone={orgTimezone}
      limit={PAGE_LIMIT}
      onSuccess={refreshClasses}
    />
  );
}

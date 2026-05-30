// ─────────────────────────────────────────────
// @workspace/ui — Public API
// ─────────────────────────────────────────────

// Utilities
export { cn } from "@workspace/ui/lib/utils";

// Fundamental Blocks
export { Button } from "@workspace/ui/components/button";
export { Input } from "@workspace/ui/components/input";
export { Title, Eyebrow, SectionHeader } from "@workspace/ui/components/title";
export { ServiceCard } from "@workspace/ui/components/service-card";
export { Navbar, NavbarItem } from "@workspace/ui/components/navbar";
export { Hero } from "@workspace/ui/components/hero";
export { OurServices } from "@workspace/ui/components/our-services";
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
export { Table } from "@workspace/ui/components/table";
export type { TableProps, ColumnDef } from "@workspace/ui/components/table";
export { Pagination } from "@workspace/ui/components/pagination";
export type { PaginationProps } from "@workspace/ui/components/pagination";
export { SimpleAvatar as Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
export { Badge } from "@workspace/ui/components/badge";
export { Text } from "@workspace/ui/components/text";

// Feedback
export { Toaster } from "@workspace/ui/components/sonner";
export { toast } from "sonner";
export { Spinner } from "@workspace/ui/components/spinner";
export { Modal } from "@workspace/ui/components/modal";
export { TooltipProvider, SimpleTooltip } from "./tooltip";
export { Checkbox } from "@workspace/ui/components/checkbox";
export { CheckboxCard } from "@workspace/ui/components/checkbox-card";
export { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
export { Label } from "@workspace/ui/components/label";
export { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group";
export { Skeleton } from "@workspace/ui/components/skeleton";

export { ColorPicker } from "@workspace/ui/components/color-picker";
export { ImageUpload } from "@workspace/ui/components/image-upload";

export { CoachCard, AddCoachCard } from "@workspace/ui/components/coach-card";
export { PlanCard } from "@workspace/ui/components/plan-card";
export { Switch } from "@workspace/ui/components/switch";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "@workspace/ui/components/tabs";
export { FormTabs } from "@workspace/ui/components/form-tabs";
export { CountrySelector } from "@workspace/ui/components/country-selector";
export { CurrencySelector } from "@workspace/ui/components/currency-selector";
export { SimpleSelect } from "@workspace/ui/components/simple-select";
export type { SimpleSelectOption } from "@workspace/ui/components/simple-select";
export { Separator } from "@workspace/ui/components/separator";
export { Textarea } from "@workspace/ui/components/textarea";
export { ActionsDropdown } from "@workspace/ui/components/actions-dropdown";
export type { ActionDropdownItem, ActionDropdownSection } from "@workspace/ui/components/actions-dropdown";
export { FloatingActionButton, DEFAULT_FAB_ITEMS } from "@workspace/ui/components/floating-action-button";
export type { FabItem, FabConfig } from "@workspace/ui/components/floating-action-button";

// Next.js specific components
export { AppSidebar, MobileNav, SettingsSidebar } from "@workspace/ui/components/next/sidebar";
export type { SidebarUser, SidebarNavItem } from "@workspace/ui/components/next/sidebar";
export { NavTabs } from "@workspace/ui/components/next/nav-tabs";
export { NextImage } from "@workspace/ui/components/next/image";

// Special UI
export { SplashScreen } from "@workspace/ui/components/splash-screen";

// Charts
export { SimpleChart } from "@workspace/ui/components/simple-chart";
export { ChartHeader } from "@workspace/ui/components/chart-header";
export type { ChartHeaderOption, ChartHeaderProps } from "@workspace/ui/components/chart-header";
export type { ChartConfig } from "@workspace/ui/components/chart";
export { ChartCarousel } from "@workspace/ui/components/chart-carousel";
export type { ChartCarouselProps, ChartView } from "@workspace/ui/components/chart-carousel";

// Dashboard utilities
export { DashboardHeader } from "@workspace/ui/components/dashboard-header";
export { FilterPanel } from "@workspace/ui/components/filter-panel";
export type { FilterPanelProps } from "@workspace/ui/components/filter-panel";
export { StatCard } from "@workspace/ui/components/stat-card";

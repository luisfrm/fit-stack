// ─────────────────────────────────────────────
// @workspace/ui — Public API
// ─────────────────────────────────────────────

// Utilities
export { cn } from "@workspace/ui/lib/utils";

// UI Components
export { Button, buttonVariants } from "@workspace/ui/components/button";
export type { ButtonProps } from "@workspace/ui/components/button";

export { Input, inputWrapperVariants } from "@workspace/ui/components/input";
export type { InputProps } from "@workspace/ui/components/input";

export {
  Title,
  TitleAccent,
  Eyebrow,
  SectionHeader,
  titleVariants,
  eyebrowVariants,
} from "@workspace/ui/components/title";
export type { TitleProps, EyebrowProps } from "@workspace/ui/components/title";

export { ServiceCard, serviceCardVariants } from "@workspace/ui/components/service-card";
export type { ServiceCardProps } from "@workspace/ui/components/service-card";

// Layout
export { Navbar, NavbarItem } from "@workspace/ui/components/navbar";
export type { NavbarProps, NavbarItemProps, NavItem } from "@workspace/ui/components/navbar";

// Sections
export { Hero } from "@workspace/ui/components/hero";
export type { HeroProps } from "@workspace/ui/components/hero";

export { OurServices } from "@workspace/ui/components/our-services";
export type { OurServicesProps, ServiceItem } from "@workspace/ui/components/our-services";

export * from "@workspace/ui/components/card";
export { Table } from "@workspace/ui/components/table";
export type { TableProps, ColumnDef } from "@workspace/ui/components/table";
export * from "@workspace/ui/components/avatar";
export * from "@workspace/ui/components/badge";
export * from "@workspace/ui/components/text";

// Feedback
export { Toaster } from "@workspace/ui/components/sonner";
export { toast } from "sonner";
export { Spinner } from "@workspace/ui/components/spinner";
export { Modal } from "@workspace/ui/components/modal";
export { Checkbox } from "@workspace/ui/components/checkbox";
export { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
export { Label } from "@workspace/ui/components/label";
export * from "@workspace/ui/components/select";
export * from "@workspace/ui/components/sheet";
export * from "@workspace/ui/components/toggle-group";
export { Skeleton } from "@workspace/ui/components/skeleton";

export { ColorPicker } from "@workspace/ui/components/color-picker";
export type { ColorPickerProps } from "@workspace/ui/components/color-picker";
export { ImageUpload } from "@workspace/ui/components/image-upload";
export type { ImageUploadProps } from "@workspace/ui/components/image-upload";

export { CoachCard, AddCoachCard } from "@workspace/ui/components/coach-card";
export type { CoachCardProps } from "@workspace/ui/components/coach-card";
export { PlanCard } from "@workspace/ui/components/plan-card";
export type { PlanCardProps } from "@workspace/ui/components/plan-card";
export { Switch } from "@workspace/ui/components/switch";
export { Textarea } from "@workspace/ui/components/textarea";
export type { TextareaProps } from "@workspace/ui/components/textarea";
export * from "@workspace/ui/components/dialog";

// Next.js specific components
export * from "@workspace/ui/components/next/sidebar";
export { NextImage } from "@workspace/ui/components/next/image";


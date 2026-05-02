"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Root Tabs component
 */
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

/**
 * TabsList container variants following Fit-Stack tokens
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-xl p-1 transition-all group-data-[orientation=horizontal]/tabs:h-12 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        /**
         * Glass — Signature CMS look
         */
        glass: "bg-glass backdrop-blur-md border border-white/10",
        /**
         * Surface — Solid technical look
         */
        surface: "bg-surface border border-border",
        /**
         * Input — Matching form inputs
         */
        input: "bg-input border border-input-border",
        /**
         * Plain — No background/border
         */
        plain: "bg-transparent border-transparent",
      },
    },
    defaultVariants: {
      variant: "surface",
    },
  }
)

function TabsList({
  className,
  variant = "surface",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

/**
 * Individual Tab Trigger
 */
function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // Base styles
        "relative inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer",
        "text-foreground/50 hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        
        // Active state styles
        "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:scale-[1.02]",
        
        // Icon handling
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        
        // Vertical layout overrides
        "group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start",
        
        className
      )}
      {...props}
    />
  )
}

/**
 * Tab Content Panel
 */
function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "flex-1 text-sm outline-none transition-all animate-in fade-in-50 duration-300", 
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }

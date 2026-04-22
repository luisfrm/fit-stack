"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import { cn } from "../lib/utils"



interface SimpleChartProps {
  /** Array of data objects */
  readonly data: Record<string, unknown>[]
  /** Configuration for labels and colors */
  readonly config: ChartConfig
  /** Key for the X-axis */
  readonly index: string
  /** Array of keys for the Y-axis */
  readonly categories: string[]
  /** Visual type of the chart */
  readonly type?: "area" | "bar" | "line"
  /** Visual variant (from Fit-Stack theme) */
  readonly variant?: "glass" | "default"
  /** Custom classes for the container */
  readonly className?: string
  /** Show/hide grid lines */
  readonly showGrid?: boolean
  /** Show/hide legend */
  readonly showLegend?: boolean
  /** Whether the chart is stacked (for area/bar) */
  readonly stacked?: boolean
  /** Custom formatter for X-axis ticks */
  readonly xAxisFormatter?: (value: string | number) => string
  /** Whether to show the Y-axis */
  readonly showYAxis?: boolean
  /** Custom formatter for Y-axis ticks */
  readonly yAxisFormatter?: (value: string | number) => string
  /** Custom formatter for Tooltip */
  readonly tooltipFormatter?: React.ComponentProps<typeof ChartTooltipContent>["formatter"]
}

/**
 * SimpleChart - High-level abstraction for Recharts.
 */
export function SimpleChart({
  data,
  config,
  index,
  categories,
  type = "area",
  variant = "default",
  className,
  showGrid = true,
  showLegend = false,
  stacked = false,
  xAxisFormatter,
  showYAxis = false,
  yAxisFormatter,
  tooltipFormatter,
}: SimpleChartProps) {
  return (
    <ChartContainer config={config} variant={variant} className={cn("h-full w-full aspect-auto", className)}>
      {renderChart({
        type,
        data,
        index,
        categories,
        showGrid,
        showLegend,
        stacked,
        xAxisFormatter,
        showYAxis,
        yAxisFormatter,
        tooltipFormatter
      })}
    </ChartContainer>
  )
}

function renderChart({
  type,
  data,
  index,
  categories,
  showGrid,
  showLegend,
  stacked,
  xAxisFormatter,
  showYAxis,
  yAxisFormatter,
  tooltipFormatter
}: {
  type: "area" | "bar" | "line",
  data: Record<string, unknown>[],
  index: string,
  categories: string[],
  showGrid: boolean,
  showLegend: boolean,
  stacked: boolean,
  xAxisFormatter?: (value: string | number) => string,
  showYAxis?: boolean,
  yAxisFormatter?: (value: string | number) => string,
  tooltipFormatter?: React.ComponentProps<typeof ChartTooltipContent>["formatter"]
}) {
  const commonProps = {
    data,
    margin: {
      left: 0,
      right: 12,
      top: 12,
      bottom: 0
    },
  }

  const grid = showGrid && <CartesianGrid vertical={false} />
  const xAxis = (
    <XAxis
      dataKey={index}
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      tickFormatter={xAxisFormatter ?? ((value) => value)}
    />
  )
  const yAxis = showYAxis && (
    <YAxis
      width={40}
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      tickFormatter={yAxisFormatter}
      className="text-[10px] fill-foreground/50"
    />
  )
  const tooltip = (
    <ChartTooltip
      cursor={false}
      content={<ChartTooltipContent hideLabel formatter={tooltipFormatter} />}
    />
  )
  const legend = showLegend && (
    <ChartLegend content={<ChartLegendContent />} />
  )

  switch (type) {
    case "bar":
      return (
        <BarChart {...commonProps}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {categories.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              fill={`var(--color-${key})`}
              radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
              stackId={stacked ? "a" : undefined}
            />
          ))}
        </BarChart>
      )
    case "line":
      return (
        <LineChart {...commonProps}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {categories.map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      )
    case "area":
    default:
      return (
        <AreaChart {...commonProps}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          {legend}
          {categories.map((key) => (
            <Area
              key={key}
              dataKey={key}
              type="natural"
              fill={`var(--color-${key})`}
              fillOpacity={0.4}
              stroke={`var(--color-${key})`}
              stackId={stacked ? "a" : undefined}
            />
          ))}
        </AreaChart>
      )
  }
}

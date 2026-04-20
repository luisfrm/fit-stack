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
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "./chart"

interface SimpleChartProps {
  /** Array of data objects */
  readonly data: Record<string, string | number | boolean>[]
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
}

/**
 * SimpleChart - High-level abstraction for Recharts.
 * Follows the "Tactical Simplicity" pattern (like Modal.tsx).
 * Handles boilerplate and ensures visual synergy with the Fit-Stack theme.
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
}: SimpleChartProps) {
  return (
    <ChartContainer config={config} variant={variant} className={className}>
      {renderChart(type, data, index, categories, showGrid, showLegend, stacked)}
    </ChartContainer>
  )
}

function renderChart(
  type: "area" | "bar" | "line",
  data: Record<string, string | number | boolean>[],
  index: string,
  categories: string[],
  showGrid: boolean,
  showLegend: boolean,
  stacked: boolean
) {
  const commonProps = {
    data,
    margin: { left: 12, right: 12, top: 12, bottom: 0 },
  }

  const grid = showGrid && <CartesianGrid vertical={false} />
  const xAxis = (
    <XAxis
      dataKey={index}
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      tickFormatter={(value) => value.slice(0, 3)}
    />
  )
  const tooltip = (
    <ChartTooltip
      cursor={false}
      content={<ChartTooltipContent hideLabel />}
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

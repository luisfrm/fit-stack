"use client";

import * as React from "react";
import { Card, CardContent, ChartHeader } from "./index";

export interface ChartView {
  id: string;
  title: string;
  description: string;
  renderChart: () => React.ReactNode;
  options?: { label: string; value: string }[];
}

export interface ChartCarouselProps {
  views: ChartView[];
  className?: string;
}

export function ChartCarousel({ views, className }: Readonly<ChartCarouselProps>) {
  const [activeIndex, setActiveIndex] = React.useState(0);

  if (!views || views.length === 0) return null;

  const currentView = views[activeIndex];

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? views.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev === views.length - 1 ? 0 : prev + 1));
  };

  // Enforce a dummy options array if none provided to keep header height stable
  const headerOptions = currentView?.options || [];

  return (
    <Card variant="glass" className={`w-full h-full flex flex-col ${className || ''}`}>
      <ChartHeader
        title={currentView?.title || ""}
        description={currentView?.description || ""}
        viewWindow={headerOptions[0]?.value || "all"}
        onViewWindowChange={() => { }}
        onPrev={handlePrev}
        onNext={handleNext}
        canPrev={true}
        canNext={true}
        options={headerOptions}
        className="flex-none"
      />
      <CardContent className="flex-1 flex flex-col">
        <div className="h-[300px] w-full mt-auto relative">
          {/* Render active chart and use key to force unmount/remount between views to reset animations */}
          <React.Fragment key={currentView?.id}>
            {currentView?.renderChart()}
          </React.Fragment>
        </div>
      </CardContent>
    </Card>
  );
}
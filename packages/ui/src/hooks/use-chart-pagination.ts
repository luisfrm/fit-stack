import * as React from "react";

interface ChartPaginationOptions {
  initialWindow?: number;
}

export function useChartPagination<T>(data: T[], options: ChartPaginationOptions = {}) {
  const [viewWindow, setViewWindow] = React.useState<number | string>(options.initialWindow ?? 7);
  const [offset, setOffset] = React.useState(0);

  // Reset offset when data changes significantly or viewWindow changes
  const handleViewWindowChange = React.useCallback((v: number | string) => {
    setViewWindow(v);
    setOffset(0);
  }, []);

  const onPrev = React.useCallback(() => {
    const windowSize = Number(viewWindow);
    setOffset((prev) => Math.min(data.length - windowSize, prev + windowSize));
  }, [data.length, viewWindow]);

  const onNext = React.useCallback(() => {
    const windowSize = Number(viewWindow);
    setOffset((prev) => Math.max(0, prev - windowSize));
  }, [viewWindow]);

  const windowSize = Number(viewWindow);
  const canPrev = offset + windowSize < data.length;
  const canNext = offset > 0;

  const slicedData = React.useMemo(() => {
    const windowSize = Number(viewWindow);
    const end = data.length - offset;
    const start = Math.max(0, end - windowSize);
    return data.slice(start, end);
  }, [data, offset, viewWindow]);

  return {
    slicedData,
    viewWindow,
    offset,
    onPrev,
    onNext,
    canPrev,
    canNext,
    setViewWindow: handleViewWindowChange,
  };
}

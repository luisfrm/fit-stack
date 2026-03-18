"use client";

import { useState, useEffect } from "react";

export function useWindowSize() {
  const [windowSize, setWindowSize] = useState<{
    width: number | undefined;
    height: number | undefined;
  }>({
    width: undefined,
    height: undefined,
  });

  useEffect(() => {
    // Solo se ejecuta en el cliente
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    // Registrar evento de redimensionamiento
    window.addEventListener("resize", handleResize);

    // Llamar a la función inmediatamente para establecer el tamaño inicial
    handleResize();

    // Eliminar el evento al desmontar el componente
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowSize;
}

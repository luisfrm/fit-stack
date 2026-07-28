"use client";

import Link from "next/link";
import { Button } from "@workspace/ui/components/button";
import { Text } from "@workspace/ui/components/text";
import { ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center p-6 bg-background text-foreground text-center relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] -z-10" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] -z-10" />

      <main className="max-w-md w-full space-y-8 animate-in fade-in zoom-in duration-700">
        <div className="space-y-4">
          <h1 className="text-[clamp(8rem,20vw,12rem)] font-black leading-none drop-shadow-sm tracking-tighter cursor-default select-none">
            <span className="bg-gradient-to-b from-white to-white/20 bg-clip-text text-transparent">404</span>
          </h1>
          <div className="space-y-2">
            <Text variant="primary" weight="bold" size="lg" uppercase className="tracking-[0.2em]">
              Página No Encontrada
            </Text>
            <Text variant="muted" size="md" className="max-w-[320px] mx-auto leading-relaxed">
              Parece que el camino que buscabas no existe o ha sido movido.
            </Text>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-4 justify-center">
          <Button 
            asChild 
            variant="primary" 
            size="lg" 
            rounded="lg"
            className="group shadow-xl shadow-primary/10" 
            leftIcon={<ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />}
          >
            <Link href="/dashboard">
              Volver al Panel
            </Link>
          </Button>
          <Button 
            asChild 
            variant="glass" 
            size="lg" 
            rounded="lg"
            leftIcon={<Home className="w-4 h-4 text-slate-400" />}
          >
            <Link href="/">
              Inicio
            </Link>
          </Button>
        </div>
      </main>

      <footer className="absolute bottom-8 text-slate-500 text-[10px] font-bold tracking-[0.3em] uppercase opacity-30 select-none">
        FitStack CMS &copy; 2026
      </footer>
    </div>
  );
}

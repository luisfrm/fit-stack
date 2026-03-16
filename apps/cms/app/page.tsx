export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold text-primary">CMS Dashboard</h1>
        <p className="mt-4 text-foreground-muted">
          Este es el panel centralizado de Fit-Stack CMS.
        </p>
      </div>
      
      <div className="mt-8 p-6 border border-border rounded-lg bg-surface shadow-lg">
        <p className="text-primary-hover">Pronto verás más herramientas aquí.</p>
      </div>
    </main>
  );
}

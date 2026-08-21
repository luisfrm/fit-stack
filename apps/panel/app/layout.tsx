import { DM_Sans, Space_Grotesk } from "next/font/google";
import { Toaster } from "@workspace/ui/components";
import { Providers } from "@/components/providers";
import type { Metadata } from "next";
import "@workspace/ui/globals.css";

export const metadata: Metadata = {
  title: "FitStack Panel",
  description: "Sistema de administración de contenido",
  icons: {
    icon: "/favicon.ico",
  },
};

const fontSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontDisplay = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${fontSans.variable} ${fontDisplay.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}

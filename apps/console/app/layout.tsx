import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@workspace/ui/components";
import { Providers } from "@/components/providers";
import type { Metadata } from "next";
import "@workspace/ui/globals.css";

export const metadata: Metadata = {
  title: "FitStack Console",
  description: "Panel de administración SaaS",
  icons: {
    icon: "/favicon.ico",
  },
};

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
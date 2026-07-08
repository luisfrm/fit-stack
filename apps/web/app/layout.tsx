import { Geist, Geist_Mono } from "next/font/google"

import "@workspace/ui/globals.css"
import { Providers } from "@/components/providers"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata = {
  title: "Fit-Stack | Gestion Fitness Sin Limites",
  description:
    "La plataforma todo-en-uno para controlar miembros, pagos, clases y acceso fisico de tu centro deportivo.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

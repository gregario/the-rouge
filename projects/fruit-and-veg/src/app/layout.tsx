import type { Metadata } from 'next'
import { loadCatalogue } from '@/lib/catalogue'
import { AppShell } from '@/components/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fruit & Veg — Learn about fruits and vegetables!',
  description: 'Kids discover and collect fruit and vegetable knowledge through playful flashcards.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const catalogue = await loadCatalogue()

  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground font-body antialiased">
        <AppShell catalogue={catalogue}>
          {children}
        </AppShell>
      </body>
    </html>
  )
}

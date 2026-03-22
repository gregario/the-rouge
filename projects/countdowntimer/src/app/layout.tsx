import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Epoch — Time, designed.',
  description: 'A focus timer that\'s beautiful enough to leave on screen.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MD Hygiene Social Manager',
  description: 'Social media management dashboard for MD Hygiene',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

// Trigger a fresh Vercel deployment after configuration updates.

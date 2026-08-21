import type { Metadata } from 'next';
import './globals.css';
import './dashboard/ui.css';
import './madgicx-theme.css';

export const metadata: Metadata = {
  title: 'MD Hygiene Social Manager',
  description: 'Social media management dashboard for MD Hygiene',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

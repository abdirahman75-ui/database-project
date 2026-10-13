import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ConsulEase | Consular services, connected',
  description:
    'Citizen services and consular case management for the Embassy of Somalia in Malaysia. Academic prototype.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

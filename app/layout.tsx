import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AERVELYS OPS 5.0',
  description: 'Virtuelle Business Aviation – neue Operations-Plattform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}

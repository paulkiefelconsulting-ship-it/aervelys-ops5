import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {default:'AERVELYS | Business Aviation',template:'%s | AERVELYS'},
  icons: {icon:'/brand/aervelys-mark.svg',shortcut:'/brand/aervelys-mark.svg'},
  description: 'AERVELYS Business Aviation – Private Virtual Airline Operations',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}

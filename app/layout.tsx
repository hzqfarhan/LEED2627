import type { Metadata, Viewport } from 'next';
import { Caveat, Kanit, Plus_Jakarta_Sans } from 'next/font/google';
import PwaClient from '@/components/PwaClient';
import SiteNav from '@/components/SiteNav';
import { EVENT } from '@/lib/event';
import './globals.css';

// Plus Jakarta Sans: open, rounded letters that stay legible on a phone in daylight and suit the logo's friendly shapes.
const body = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '700', '800'], variable: '--font-body', display: 'swap' });
// Kanit's heavy italic matches the lettering under the LEED logo.
const display = Kanit({ subsets: ['latin'], weight: ['600', '700', '800', '900'], style: ['normal', 'italic'], variable: '--font-display', display: 'swap' });
const hand = Caveat({ subsets: ['latin'], variable: '--font-hand', display: 'swap' });

export const metadata: Metadata = {
  title: { default: `${EVENT.name}: ${EVENT.fullName}`, template: `%s | ${EVENT.name}` },
  openGraph: { images: [{ url: '/brand/leed-share.jpg', width: 1200, height: 630 }] },
  description: `${EVENT.fullName}. Judging, venue map and memory wall for the carnival at the ${EVENT.venue}.`,
  applicationName: EVENT.name,
  appleWebApp: { capable: true, title: EVENT.name, statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#2B0B5E',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${hand.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <SiteNav />
        <main id="main">{children}</main>
        <footer className="foot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/leed-logo-small.webp" width={360} height={242} alt="" loading="lazy" />
          <p>
            {EVENT.fullName}. Organised by {EVENT.organiser}, {EVENT.university}.
          </p>
          <p>
            {EVENT.venue}, {EVENT.address}.{' '}
            <a href={EVENT.instagram} target="_blank" rel="noreferrer">
              Instagram {EVENT.instagramHandle}
            </a>
          </p>
        </footer>
        <PwaClient />
      </body>
    </html>
  );
}

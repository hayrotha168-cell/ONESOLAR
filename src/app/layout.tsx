import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Khmer } from 'next/font/google';
import './globals.css';

// Self-hosted at build time, so Khmer text renders the same on every device and offline.
const khmer = Noto_Sans_Khmer({ subsets: ['khmer'], weight: ['400', '600', '700', '800'], variable: '--font-khmer', display: 'swap' });
import { RegisterSW } from '@/components/RegisterSW';
import { THEME_BOOT } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'ONE SOLAR',
  description: 'Solar cable size calculator and 3D sun & shade site survey.',
  applicationName: 'ONE SOLAR',
  appleWebApp: { capable: true, title: 'ONE SOLAR', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1120' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={khmer.variable} suppressHydrationWarning>
      <head>
        {/* Apply the saved Light/Dark choice before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}

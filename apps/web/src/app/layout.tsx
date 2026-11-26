import type { Metadata, Viewport } from 'next';
import './globals.css';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import ThemeProvider, { THEME_SCRIPT } from '@/components/ThemeProvider';
import I18nProvider from '@/i18n/I18nProvider';
import StoreProvider from '@/store/StoreProvider';

export const metadata: Metadata = {
  title: 'Food Delivery',
  description: 'Order food from one restaurant. University project demo with simulated payments.',
};

/**
 * `viewport-fit` and a real width are what make the phone layout work: without
 * them a phone renders the page at desktop width and shrinks it.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // One colour per theme, so the bar a phone paints above the page does not
  // stay light above a dark page.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#181614' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Applies the stored theme before the first paint. Inline and blocking on
          purpose: anything loaded later runs after the page has been drawn,
          which is exactly the flash of the wrong theme this prevents.
          suppressHydrationWarning is on <html> because this script changes the
          attributes React then compares against what the server rendered.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col bg-stone-50 text-stone-900 antialiased">
        <ThemeProvider>
          <I18nProvider>
            <StoreProvider>
              <Header />
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
              <Footer />
            </StoreProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

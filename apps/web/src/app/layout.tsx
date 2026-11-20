import type { Metadata, Viewport } from 'next';
import './globals.css';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
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
  themeColor: '#047857',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-stone-50 text-stone-900 antialiased">
        <I18nProvider>
          <StoreProvider>
            <Header />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
            <Footer />
          </StoreProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

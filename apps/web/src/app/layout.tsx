import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import StoreProvider from '@/store/StoreProvider';

export const metadata: Metadata = {
  title: 'Food Delivery',
  description: 'Order food from one restaurant. University project demo with simulated payments.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <StoreProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-stone-500">
            Coursework prototype. Synthetic data, simulated payments: no real money moves.
          </footer>
        </StoreProvider>
      </body>
    </html>
  );
}

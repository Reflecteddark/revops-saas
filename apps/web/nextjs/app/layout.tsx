import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RevOps Intelligence SaaS — 2026 Enterprise Cockpit',
  description: 'AI-Native Revenue Operations, Monte-Carlo Stochastic Forecasting & Funnel Optimization.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark">
      <body className="bg-[#0b0d14] text-[#f0f3fa] antialiased min-h-screen selection:bg-purple-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}

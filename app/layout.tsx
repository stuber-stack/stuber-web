import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Join a Stuber',
  description: 'Split the Uber cost with fellow students.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}

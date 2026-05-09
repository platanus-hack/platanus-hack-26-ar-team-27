import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retail Growth Engine",
  description: "Autonomous ads + creator outreach for B2C retailers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}

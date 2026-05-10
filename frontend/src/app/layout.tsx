import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TM2 · Take Me To Market",
  description: "Multi-agent GTM para startups",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}

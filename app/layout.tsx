import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IT Liga Niš | Built in tech. United by football.",
  description: "Fixtures, results, standings, teams and top scorers for the IT Liga Niš 2026/27 football season.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

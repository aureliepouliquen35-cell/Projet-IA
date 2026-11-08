import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Police unique de DESIGN.md ; le repli système est déclaré dans globals.css.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nova Services",
  description: "Déposez et suivez vos demandes auprès de Nova Services.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

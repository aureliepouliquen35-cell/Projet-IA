"use client"; // Les écrans d'erreur de Next.js sont des Client Components.

import { Inter } from "next/font/google";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { EcranErreurInattendue } from "@/components/ecran-erreur";
import { codeDepuisErreur } from "@/shared/code-support";

import "./globals.css";

// S3 quand l'erreur touche la mise en page racine elle-même : cet écran
// remplace `layout.tsx`, il doit donc fournir <html>, <body>, le thème et la
// police Inter (mêmes réglages que layout.tsx).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export default function ErreurGlobale({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const page = usePathname() ?? "/";
  const [date] = useState(() => new Date());

  return (
    <html lang="fr" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <title>Nova Services</title>
        <EcranErreurInattendue
          code={codeDepuisErreur(error)}
          date={date}
          page={page}
          onReessayer={retry}
        />
      </body>
    </html>
  );
}

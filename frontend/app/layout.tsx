import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import GlassOrbs from "@/components/GlassOrbs";
import VoiceAppProvider from "@/components/VoiceAppProvider";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Interview Management Portal",
  description: "Interview analytics and tracking portal for RizViz",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex bg-[#f0f2ff] dark:bg-[#08070f] text-slate-900 dark:text-indigo-50">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <GlassOrbs />
          <VoiceAppProvider>
            <AppShell>{children}</AppShell>
          </VoiceAppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

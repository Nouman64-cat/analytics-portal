import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
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
          {/* Background shape orbs for glassmorphism */}
          <div aria-hidden="true" className="glass-orbs pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            {/* Top-left — indigo */}
            <div className="absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-indigo-400/75 dark:bg-indigo-500/90 blur-[55px]" />
            {/* Top-right — pink/rose */}
            <div className="absolute -top-16 right-[10%] h-[340px] w-[340px] rounded-full bg-pink-400/70 dark:bg-pink-500/85 blur-[50px]" />
            {/* Center-left — purple */}
            <div className="absolute top-[35%] -left-16 h-[300px] w-[300px] rounded-full bg-purple-500/65 dark:bg-purple-500/85 blur-[45px]" />
            {/* Center-right — sky */}
            <div className="absolute top-[30%] right-[5%] h-[360px] w-[360px] rounded-full bg-sky-400/65 dark:bg-cyan-500/80 blur-[50px]" />
            {/* Bottom-center — emerald */}
            <div className="absolute bottom-[-60px] left-[35%] h-[380px] w-[380px] rounded-full bg-emerald-400/60 dark:bg-emerald-500/80 blur-[52px]" />
            {/* Bottom-left — violet */}
            <div className="absolute bottom-[10%] left-[10%] h-[260px] w-[260px] rounded-full bg-violet-400/60 dark:bg-violet-500/80 blur-[45px]" />
            {/* Bottom-right — amber */}
            <div className="absolute bottom-[5%] right-[8%] h-[280px] w-[280px] rounded-full bg-amber-400/55 dark:bg-amber-400/75 blur-[48px]" />
          </div>
          <VoiceAppProvider>
            <AppShell>{children}</AppShell>
          </VoiceAppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Rizviz Analytics Portal",
  description: "Interview analytics and tracking portal for RizViz",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex bg-slate-50 dark:bg-[#0a0b10] text-slate-900 dark:text-indigo-50 transition-colors duration-300">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Sidebar />
          <main className="ml-[260px] flex-1 min-h-screen transition-all duration-300">
            <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}

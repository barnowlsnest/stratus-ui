import type { Metadata } from "next";
import { Header } from "@/components/header";
import { StratusProvider } from "@/components/stratus-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stratus",
  description: "Web console for Stratus streams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StratusProvider>
          <div className="box-border flex min-h-screen flex-col gap-4 px-6 pb-6 pt-4">
            <Header />
            {children}
          </div>
        </StratusProvider>
      </body>
    </html>
  );
}

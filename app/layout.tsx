import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://dozi-music-studio.sites.openai.com"),
  title: { default: "Dozi Music Studio", template: "%s · Dozi" },
  description: "A generative music workspace for shaping, versioning, and playing original songs.",
  icons: { icon: "/favicon.svg" },
  openGraph: { title: "Dozi Music Studio", description: "Shape an idea into sound.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Dozi Music Studio", description: "Shape an idea into sound.", images: ["/og.png"] },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

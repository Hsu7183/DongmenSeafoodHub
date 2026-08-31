import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "東門採購｜東門市場 B2B 水產採購", template: "%s｜東門採購" },
  description: "市場好食材，集中好採購。東門市場攤商、餐飲業者專屬的水產與冷凍食材採購工作台。",
  robots: { index: false, follow: false },
  openGraph: { title: "東門採購 Dongmen Seafood Hub", description: "專為市場生意打造的 B2B 食材採購工作台", locale: "zh_TW", type: "website" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}

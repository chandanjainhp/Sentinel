import "./globals.css";
import Providers from "@/components/shared/Providers";
import RootFrame from "@/components/layout/RootFrame";

export const metadata = {
  title: "Sentinel — Overnight Intelligence Platform",
  description: "Sentinel Overnight Intelligence Platform. Mission Control.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body style={{ backgroundColor: "var(--bg-base)", margin: 0 }}>
        <Providers>
          <RootFrame>{children}</RootFrame>
        </Providers>
      </body>
    </html>
  );
}

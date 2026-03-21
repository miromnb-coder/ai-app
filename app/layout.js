import "./globals.css";
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: "Halo Mode AI Agent",
  description: "Voice-first AI agent for smart glasses and mobile",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fi">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "Halo Mode AI Agent",
  description: "Voice-first AI agent for smart glasses and mobile",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fi">
      <body>{children}</body>
    </html>
  );
}

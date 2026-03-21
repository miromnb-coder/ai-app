import "./globals.css";

export const metadata = {
  title: "Halo Glass AI",
  description: "Voice commands, battery saver, memory and vision for smart glasses-style AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fi">
      <body>{children}</body>
    </html>
  );
}

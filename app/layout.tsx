import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TaskPlanner",
  description: "Планировщик задач",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" style={{ background: "#131210" }}>
      <body style={{ background: "#131210", color: "#f0ece4", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  );
}

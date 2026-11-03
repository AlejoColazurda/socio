import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Socio · completa por vos",
  description: "El empleado administrativo por WhatsApp que carga tu ERP, CRM o SaaS. Hecho con Meta Model API.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

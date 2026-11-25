import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource-variable/manrope";

import type { Metadata } from "next";

import { StaffAccess } from "../staff/staff-access";
import { AdminDashboard } from "./dashboard";

export const metadata: Metadata = { title: "Administración | Proyecto Restaurantes" };

export default function AdminPage() {
  return <StaffAccess section="admin"><AdminDashboard /></StaffAccess>;
}

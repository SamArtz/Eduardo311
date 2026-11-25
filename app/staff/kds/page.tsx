import type { Metadata } from "next";

import { KitchenBoard } from "../kitchen";
import { StaffAccess } from "../staff-access";

export const metadata: Metadata = { title: "Cocina | Proyecto Restaurantes" };

export default function KitchenPage() {
  return <StaffAccess section="kds"><KitchenBoard /></StaffAccess>;
}

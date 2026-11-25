import type { Metadata } from "next";

import { WaiterBoard } from "../waiter";
import { StaffAccess } from "../staff-access";

export const metadata: Metadata = { title: "Meseros | Proyecto Restaurantes" };

export default function WaiterPage() {
  return <StaffAccess section="waiter"><WaiterBoard /></StaffAccess>;
}

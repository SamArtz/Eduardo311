import { Utensils } from "lucide-react";

export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center bg-stone-100 px-6 text-stone-900">
      <h1 className="flex items-center gap-3 text-2xl font-semibold">
        <Utensils aria-hidden="true" className="size-6 text-emerald-800" />
        Proyecto Restaurantes
      </h1>
    </main>
  );
}

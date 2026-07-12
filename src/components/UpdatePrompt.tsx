import { useEffect, useState } from "react";
import { registerServiceWorker } from "../lib/register-sw";

export function UpdatePrompt() {
  const [reloadFn, setReloadFn] = useState<(() => void) | null>(null);

  useEffect(() => {
    registerServiceWorker((reload) => setReloadFn(() => reload));
  }, []);

  if (!reloadFn) return null;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[100px] z-[100] flex items-center gap-3 rounded-2xl bg-foreground/95 text-background px-4 py-3 shadow-2xl backdrop-blur-md max-w-[calc(100vw-32px)]">
      <span className="text-sm font-medium">Nova versão disponível</span>
      <button
        onClick={reloadFn}
        className="text-sm font-semibold rounded-lg bg-primary text-primary-foreground px-3 py-1.5 hover:bg-primary/90 transition-colors"
      >
        Atualizar
      </button>
    </div>
  );
}
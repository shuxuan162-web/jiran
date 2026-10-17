import { useEffect } from "react";

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Jiran` : "Jiran · City of Elmina";
  }, [title]);
}

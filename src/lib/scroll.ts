/** Rolagem suave respeitando o cabeçalho fixo e prefers-reduced-motion. */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function scrollToId(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;

  const header = document.getElementById("site-header");
  const offset = (header?.offsetHeight ?? 72) + 12;
  const top = target.getBoundingClientRect().top + window.scrollY - offset;

  window.scrollTo({
    top: Math.max(top, 0),
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

/** Converte "#pacotes" ou "pacotes" e executa a rolagem. */
export function scrollToHref(href: string): void {
  scrollToId(href.replace(/^#/, ""));
}

type Fbq = (event: string, name: string, params?: Record<string, unknown>) => void;

export function fbqTrack(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  fbq?.("track", name, params);
}

export function fbqTrackCustom(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  fbq?.("trackCustom", name, params);
}
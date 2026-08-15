/**
 * Cliente HTTP para a Edge Function get-order-downloads — único ponto de
 * integração do frontend com a entrega dos PDFs de um pedido de produto
 * digital. Nunca constrói URL de Storage aqui: a única URL usada é
 * exatamente a signed URL devolvida pelo backend. Nunca loga
 * checkout_access_token, em nenhum caminho.
 */

export interface DownloadItem {
  slug: string;
  name: string;
  url: string;
  expiresIn: number;
}

export type OrderDownloadsResult =
  /** Qualquer status diferente de "paid" — inclui pending_payment e,
   * defensivamente, qualquer estado terminal futuro. O status devolvido é
   * sempre o que o backend informou, nunca fabricado. */
  | { kind: "waiting"; status: string }
  | { kind: "paid"; downloads: DownloadItem[] }
  | { kind: "error"; code: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseDownloads(raw: unknown): DownloadItem[] | null {
  if (!Array.isArray(raw)) return null;
  const downloads: DownloadItem[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    if (
      !isNonEmptyString(record.slug) ||
      !isNonEmptyString(record.name) ||
      !isNonEmptyString(record.url) ||
      typeof record.expires_in !== "number"
    ) {
      return null;
    }
    downloads.push({ slug: record.slug, name: record.name, url: record.url, expiresIn: record.expires_in });
  }
  return downloads;
}

export async function getOrderDownloads(publicId: string, checkoutAccessToken: string): Promise<OrderDownloadsResult> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-order-downloads`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_id: publicId, checkout_access_token: checkoutAccessToken }),
    });
  } catch {
    return { kind: "error", code: "network_error" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "error", code: "invalid_response" };
  }

  if (body === null || typeof body !== "object") {
    return { kind: "error", code: "invalid_response" };
  }
  const record = body as Record<string, unknown>;

  if (record.ok !== true) {
    const errorRecord = record.error as Record<string, unknown> | undefined;
    const code = isNonEmptyString(errorRecord?.code) ? (errorRecord!.code as string) : "unknown_error";
    return { kind: "error", code };
  }

  if (record.status === "paid") {
    const downloads = parseDownloads(record.downloads);
    if (downloads === null || downloads.length === 0) {
      return { kind: "error", code: "invalid_response" };
    }
    return { kind: "paid", downloads };
  }

  if (isNonEmptyString(record.status)) {
    return { kind: "waiting", status: record.status };
  }

  return { kind: "error", code: "invalid_response" };
}

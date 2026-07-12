import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/ComingSoon";
export const Route = createFileRoute("/_authenticated/admin/seo")({
  component: () => <ComingSoon title="SEO" description="Meta, OG, Twitter Card, sitemap." />,
});
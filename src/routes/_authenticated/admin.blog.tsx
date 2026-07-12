import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/ComingSoon";
export const Route = createFileRoute("/_authenticated/admin/blog")({
  component: () => <ComingSoon title="Blog" description="Editor rico, categorias e tags." />,
});
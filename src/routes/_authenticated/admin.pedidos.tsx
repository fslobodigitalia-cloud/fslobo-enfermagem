import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/ComingSoon";
export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  component: () => <ComingSoon title="Pedidos" description="Acompanhe pedidos, status e pagamentos." />,
});
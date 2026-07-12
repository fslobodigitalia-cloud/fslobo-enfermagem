import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/ComingSoon";
export const Route = createFileRoute("/_authenticated/admin/clientes")({
  component: () => <ComingSoon title="Clientes" description="Listagem, edição e exclusão de clientes." />,
});
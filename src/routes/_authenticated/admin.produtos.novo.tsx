import { createFileRoute } from "@tanstack/react-router";
import { ProductForm, emptyProduct } from "@/components/admin/ProductForm";

export const Route = createFileRoute("/_authenticated/admin/produtos/novo")({
  component: () => <ProductForm initial={emptyProduct} />,
});
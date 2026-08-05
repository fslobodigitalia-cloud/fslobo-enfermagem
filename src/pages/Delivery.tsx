import { LegalLayout } from "@/components/LegalLayout";
import { deliveryPolicy } from "@/config/legal";

export default function Delivery() {
  return <LegalLayout document={deliveryPolicy} />;
}

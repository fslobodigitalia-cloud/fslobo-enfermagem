import { LegalLayout } from "@/components/LegalLayout";
import { refundPolicy } from "@/config/legal";

export default function Refund() {
  return <LegalLayout document={refundPolicy} />;
}

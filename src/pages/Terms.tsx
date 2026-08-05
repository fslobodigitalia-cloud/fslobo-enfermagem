import { LegalLayout } from "@/components/LegalLayout";
import { termsOfUse } from "@/config/legal";

export default function Terms() {
  return <LegalLayout document={termsOfUse} />;
}

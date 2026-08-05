import { LegalLayout } from "@/components/LegalLayout";
import { privacyPolicy } from "@/config/legal";

export default function Privacy() {
  return <LegalLayout document={privacyPolicy} />;
}

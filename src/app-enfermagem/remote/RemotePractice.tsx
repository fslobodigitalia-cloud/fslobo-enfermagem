import PracticeRoutes from "../screens/PracticeScreen";
import { useAuth } from "./auth";

/**
 * Prática de anotação e evolução na conta. Os textos ficam só neste navegador (a tela avisa), não geram pontos nem
 * histórico e não há tabela nem RPC para eles. A correção assistida por IA está PAUSADA: esta tela não chama nenhum
 * serviço de IA (o código do piloto — aiFeedbackClient.ts e AiFeedbackPanel.tsx — fica sem uso, para retomar depois).
 */
export default function RemotePractice() {
  const { profile } = useAuth();
  return <PracticeRoutes avatarInitial={profile?.display_name ?? "?"} />;
}

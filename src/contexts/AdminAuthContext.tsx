/**
 * Contexto de autenticação administrativa.
 *
 * Cobre apenas o login da equipe interna (e-mail + senha via Supabase Auth).
 * Não lida com cadastro, convite, login social, recuperação de senha, magic
 * link ou qualquer acesso de clientes — isso nunca faz parte deste contexto.
 *
 * Regra central: ter uma sessão do Supabase Auth NÃO é suficiente para
 * considerar alguém administrador. Toda avaliação de sessão (no carregamento
 * inicial, em mudanças de auth e após o login) confirma o usuário com o
 * servidor via `supabase.auth.getUser()` e só concede acesso quando
 * `supabase.rpc('is_admin')` retorna `true`. Quando não retorna `true`, a
 * sessão é encerrada — nunca ficamos "logados, porém sem autorização".
 *
 * Cuidado com o callback de onAuthStateChange: a documentação do Supabase
 * alerta que chamar (ou aguardar) outros métodos assíncronos do próprio
 * cliente Supabase diretamente dentro desse callback pode travar o lock
 * interno de autenticação. Por isso, o callback aqui é síncrono e nunca
 * chama getUser()/getSession()/rpc()/signOut() nem `evaluateSession`
 * diretamente — ele só agenda a avaliação (via setTimeout) para rodar depois
 * que o próprio callback já retornou o controle ao Supabase. A única exceção
 * é SIGNED_OUT, tratado de forma síncrona porque só mexe em estado local,
 * sem nenhuma chamada ao Supabase.
 */
import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface SignInResult {
  error: string | null;
}

interface AdminAuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AdminAuthContext = React.createContext<AdminAuthState | null>(null);

const INVALID_CREDENTIALS_MESSAGE = "E-mail ou senha incorretos.";
const UNAUTHORIZED_MESSAGE = "Acesso não autorizado. Esta conta não tem permissão administrativa.";

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  // Evita reavaliar (e chamar a RPC is_admin de novo) a mesma sessão mais de
  // uma vez: getSession() no mount, o evento INITIAL_SESSION/SIGNED_IN do
  // listener e a chamada explícita em signIn podem, todos, se referir
  // exatamente à mesma sessão. A checagem + a marcação do token acontecem de
  // forma síncrona (antes de qualquer await) em evaluateSession, então quem
  // "chegar primeiro" reivindica o token e os demais viram no-op.
  const processedTokenRef = React.useRef<string | null>(null);

  // Sequência que identifica a avaliação "vigente". Toda vez que uma nova
  // avaliação autoritativa começa (evaluateSession reivindicando um token,
  // ou um SIGNED_OUT síncrono), o contador avança. Uma avaliação assíncrona
  // em andamento só aplica o resultado ao estado se, quando terminar, ainda
  // for a mais recente — isso impede que uma avaliação antiga (de uma sessão
  // já trocada, ou que já foi desconectada) sobrescreva um estado mais novo.
  const epochRef = React.useRef(0);

  // Continua true entre o mount e o cleanup do efeito abaixo — evita
  // atualizar estado depois que o provider foi desmontado.
  const mountedRef = React.useRef(true);

  // IDs de setTimeout agendados a partir do onAuthStateChange. Guardados em
  // um Set (podem existir vários eventos em sequência antes que algum
  // dispare) e cancelados no cleanup do efeito.
  const pendingTimeoutsRef = React.useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const applyUnauthorized = React.useCallback(async (epoch: number) => {
    // Encerra a sessão: nunca deixamos um usuário autenticado, porém não
    // autorizado, com uma sessão válida no navegador. Esta chamada acontece
    // sempre fora do callback de onAuthStateChange (ver comentário no topo).
    await supabase.auth.signOut();
    if (!mountedRef.current || epoch !== epochRef.current) return;
    processedTokenRef.current = null;
    setUser(null);
    setIsAdmin(false);
    setLoading(false);
  }, []);

  const applyAuthorized = React.useCallback((epoch: number, authedUser: User) => {
    if (!mountedRef.current || epoch !== epochRef.current) return;
    setUser(authedUser);
    setIsAdmin(true);
    setLoading(false);
  }, []);

  /**
   * Avalia uma sessão do zero: confirma o usuário com o servidor e checa
   * is_admin(). Faz chamadas assíncronas ao Supabase — por isso NUNCA pode
   * ser chamada diretamente de dentro do callback de onAuthStateChange, só
   * depois (via setTimeout) ou a partir de código fora do listener
   * (mount, signIn, refreshAuth).
   */
  const evaluateSession = React.useCallback(
    async (session: Session | null): Promise<boolean> => {
      const token = session?.access_token ?? null;

      if (!session?.user) {
        const epoch = ++epochRef.current;
        if (!mountedRef.current || epoch !== epochRef.current) return false;
        processedTokenRef.current = null;
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
        return false;
      }

      if (token && token === processedTokenRef.current) {
        // Mesma sessão já avaliada (ver comentário do ref acima) — nada a fazer.
        return false;
      }
      // Reivindica o token e abre uma nova época — tudo síncrono, antes do
      // primeiro await, então concorrentes que chegarem depois (mesmo que
      // agendados antes via setTimeout) sempre vêem isto já marcado.
      processedTokenRef.current = token;
      const epoch = ++epochRef.current;

      // Confirma o usuário com o servidor — nunca confia só na sessão local.
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (epoch !== epochRef.current) return false; // superada por uma avaliação mais nova
      if (userError || !userData.user) {
        await applyUnauthorized(epoch);
        return false;
      }

      const { data: adminData, error: adminError } = await supabase.rpc("is_admin");
      if (epoch !== epochRef.current) return false; // superada por uma avaliação mais nova
      if (adminError || adminData !== true) {
        await applyUnauthorized(epoch);
        return false;
      }

      applyAuthorized(epoch, userData.user);
      return true;
    },
    [applyAuthorized, applyUnauthorized],
  );

  React.useEffect(() => {
    mountedRef.current = true;
    const timeouts = pendingTimeoutsRef.current;

    setLoading(true);
    supabase.auth.getSession().then(({ data }) => {
      if (mountedRef.current) void evaluateSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Callback síncrono: nenhum await, nenhuma chamada direta ao Supabase.
      if (event === "SIGNED_OUT") {
        // Só estado local — seguro fazer aqui mesmo, sem agendar.
        epochRef.current += 1;
        processedTokenRef.current = null;
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Qualquer outro evento (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED,
      // USER_UPDATED...): agenda a avaliação para depois que este callback
      // retornar, liberando o lock interno do Supabase antes de chamarmos
      // getUser()/rpc()/signOut().
      const timeoutId = setTimeout(() => {
        pendingTimeoutsRef.current.delete(timeoutId);
        if (mountedRef.current) void evaluateSession(session);
      }, 0);
      pendingTimeoutsRef.current.add(timeoutId);
    });

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
      timeouts.forEach((id) => clearTimeout(id));
      timeouts.clear();
    };
  }, [evaluateSession]);

  const refreshAuth = React.useCallback(async () => {
    setLoading(true);
    processedTokenRef.current = null; // força reavaliação mesmo com o mesmo token
    const { data } = await supabase.auth.getSession();
    await evaluateSession(data.session);
  }, [evaluateSession]);

  const signIn = React.useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.session) {
        setLoading(false);
        return { error: INVALID_CREDENTIALS_MESSAGE };
      }

      processedTokenRef.current = null; // garante que este login seja avaliado agora
      const authorized = await evaluateSession(data.session);

      if (!authorized) {
        return { error: UNAUTHORIZED_MESSAGE };
      }
      return { error: null };
    },
    [evaluateSession],
  );

  const signOut = React.useCallback(async () => {
    processedTokenRef.current = null;
    epochRef.current += 1;
    await supabase.auth.signOut();
    if (!mountedRef.current) return;
    setUser(null);
    setIsAdmin(false);
  }, []);

  const value = React.useMemo<AdminAuthState>(
    () => ({ user, loading, isAdmin, signIn, signOut, refreshAuth }),
    [user, loading, isAdmin, signIn, signOut, refreshAuth],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthState {
  const ctx = React.useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth precisa estar dentro de <AdminAuthProvider>.");
  return ctx;
}

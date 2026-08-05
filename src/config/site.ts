/* ════════════════════════════════════════════════════════════════════════════
 *  ENTRE NÓS TARÔ — CONFIGURAÇÃO CENTRAL
 *
 *  Todo dado comercial (preços, pacotes, contato, prazos, pixel, textos
 *  principais) vive neste arquivo. Nenhum componente deve conter preço,
 *  telefone, link ou informação comercial escrita diretamente.
 *
 *  ⚠️  ANTES DE PUBLICAR, PREENCHA OS CAMPOS MARCADOS COM "PREENCHER".
 *      Enquanto estiverem com o valor placeholder, o site continua
 *      funcionando normalmente e um aviso aparece no console em modo dev.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Valor sentinela usado nos campos que ainda precisam ser preenchidos. */
export const PLACEHOLDER_PREFIX = "[";

export const isPlaceholder = (value: string): boolean =>
  value.trim().startsWith(PLACEHOLDER_PREFIX);

/* ─────────────────────────── Identidade da marca ────────────────────────── */

export const brand = {
  name: "Entre Nós Tarô",
  shortName: "Entre Nós",
  /** Assinatura oficial da marca. */
  tagline: "Clareza para o que ainda não tem nome.",
  /** Descrição institucional — usada em SEO e no rodapé. */
  description:
    "A Entre Nós Tarô oferece leituras online, individuais e confidenciais para quem busca novas perspectivas sobre sentimentos, decisões, caminhos profissionais e autoconhecimento.",
  logo: {
    webp: "/brand/logo-256.webp",
    png: "/brand/logo-256.png",
    alt: "Logotipo da Entre Nós Tarô: carta de tarô com lua crescente dourada",
  },
  cover: {
    webp: "/brand/capa-1600.webp",
    og: "/brand/og-entre-nos-taro.jpg",
    alt: "Capa da Entre Nós Tarô com cartas de tarô douradas diante de um eclipse roxo",
  },
  /** Vídeo cinematográfico de fundo da hero (gerado por `npm run assets`). */
  heroVideo: {
    desktop: "/brand/hero-cartas.mp4",
    mobile: "/brand/hero-cartas-mobile.mp4",
    poster: "/brand/hero-poster.webp",
    posterMobile: "/brand/hero-poster-mobile.webp",
    alt: "Ritual de leitura com velas acesas, cristais de ametista e cartas de tarô sobre veludo roxo",
  },
} as const;

/* ──────────────────────────────── Contato ───────────────────────────────── */

export const contact = {
  /** Número do WhatsApp que recebe os pedidos de leitura, com DDI e DDD. */
  whatsappNumber: "5521964903976",

  /** ⚠️ PREENCHER — usuário do Instagram, sem @. Exemplo: "entrenostaro". */
  instagramHandle: "[INSTAGRAM]",

  /** ⚠️ PREENCHER — domínio final, usado em canonical, sitemap e Open Graph. */
  siteUrl: "https://www.entrenostaro.com.br",

  /** ⚠️ PREENCHER — e-mail de contato exibido nas páginas legais. */
  email: "[EMAIL]",
} as const;

export const instagramUrl = `https://instagram.com/${contact.instagramHandle.replace(/^@/, "")}`;

/* ───────────────────────── Condições comerciais ─────────────────────────── */

export const commercial = {
  /**
   * ⚠️ CONFIRMAR — prazo estimado de entrega da leitura.
   * Aparece nos pacotes, no modal de qualificação e no FAQ.
   */
  deliveryTime: "em até 24 horas úteis",
  /** Versão curta, usada em selos e listas. */
  deliveryTimeShort: "até 24h úteis",

  /** ⚠️ CONFIRMAR — forma de pagamento aceita. */
  paymentMethod: "Pix",

  currency: "BRL",
  currencySymbol: "R$",
} as const;

/* ────────────────────────────── Meta Pixel ──────────────────────────────── */

export const analytics = {
  /**
   * ⚠️ PREENCHER — ID numérico do Meta Pixel.
   * Enquanto estiver como placeholder, o pixel simplesmente não carrega.
   */
  metaPixelId: "[META_PIXEL_ID]",
} as const;

/* ─────────────────────────────── Pacotes ────────────────────────────────── */

export type PackageId = "essencial" | "clareza" | "profunda";

export interface ReadingPackage {
  id: PackageId;
  /** Nome comercial exibido nos cards. */
  name: string;
  /** Rótulo curto usado nos eventos do pixel (sem acento, snake_case). */
  eventName: string;
  questions: number;
  price: number;
  priceLabel: string;
  description: string;
  benefits: string[];
  ctaLabel: string;
  featured: boolean;
  badge?: string;
}

export const packages: ReadingPackage[] = [
  {
    id: "essencial",
    name: "Leitura Essencial",
    eventName: "leitura_essencial",
    questions: 3,
    price: 15.0,
    priceLabel: "R$ 15,00",
    description: "Para compreender uma situação específica com objetividade.",
    benefits: [
      "Três perguntas",
      "Respostas pelo WhatsApp",
      "Foto das cartas",
      "Leitura individual",
      "Atendimento confidencial",
    ],
    ctaLabel: "Escolher 3 perguntas",
    featured: false,
  },
  {
    id: "clareza",
    name: "Leitura Clareza",
    eventName: "leitura_clareza",
    questions: 7,
    price: 27.5,
    priceLabel: "R$ 27,50",
    description: "Para quem possui diferentes dúvidas relacionadas ao mesmo momento.",
    benefits: [
      "Sete perguntas",
      "Respostas detalhadas",
      "Entrega por texto ou áudio",
      "Foto das cartas",
      "Síntese final da leitura",
      "Atendimento confidencial",
    ],
    ctaLabel: "Escolher 7 perguntas",
    featured: true,
    badge: "Mais escolhida",
  },
  {
    id: "profunda",
    name: "Leitura Profunda",
    eventName: "leitura_profunda",
    questions: 12,
    price: 47.9,
    priceLabel: "R$ 47,90",
    description:
      "Para observar diferentes áreas, sentimentos e possibilidades com mais profundidade.",
    benefits: [
      "Doze perguntas",
      "Respostas detalhadas",
      "Entrega por áudio",
      "Foto das cartas",
      "Síntese completa",
      "Uma pergunta complementar relacionada à leitura",
      "Atendimento confidencial",
    ],
    ctaLabel: "Escolher 12 perguntas",
    featured: false,
  },
];

export const getPackage = (id: PackageId): ReadingPackage =>
  packages.find((p) => p.id === id) ?? packages[0];

/* ────────────────────────── Temas das leituras ──────────────────────────── */

export type ThemeId = "amor" | "decisoes" | "trabalho" | "autoconhecimento" | "outro";

/** Chave de resultado do quiz emocional — cada opção de resposta aponta para uma. */
export type ResultTag = "clareza" | "seguranca" | "ciclo" | "coragem";

export interface QuizOption {
  label: string;
  tag: ResultTag;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: QuizOption[];
}

/** Prévia curta e não conclusiva, mostrada depois do quiz para gerar interesse na leitura completa. */
export interface QuizResult {
  title: string;
  text: string;
}

export interface ReadingTheme {
  id: Exclude<ThemeId, "outro">;
  /** Usado na URL da página dedicada: /leituras/{slug} */
  slug: string;
  label: string;
  /** Título usado nos cards da seção de temas. */
  title: string;
  text: string;
  icon: "heart" | "compass" | "briefcase" | "lotus";
  /** Fotografia real da carta, usada nos cards da home (1080x1350). */
  image: {
    avif: string;
    webp: string;
    small: string;
    alt: string;
    /** Mesma foto em recorte largo (1920x960), para a hero da página do tema. */
    heroWebp: string;
    heroAvif: string;
  };
  /** Conteúdo exclusivo da página do tema. */
  page: {
    eyebrow: string;
    title: string;
    intro: string;
    /** O que a leitura ajuda a observar dentro deste tema. */
    observe: string[];
    /** Exemplos de perguntas específicas do tema. */
    questions: string[];
    /** Limite honesto: o que esta leitura não faz. */
    boundary: string;
    seoTitle: string;
    seoDescription: string;
  };
  /** Quiz emocional exibido na página do tema, antes de revelar os pacotes. */
  quiz: {
    questions: QuizQuestion[];
    results: Record<ResultTag, QuizResult>;
  };
}

export const themes: ReadingTheme[] = [
  {
    id: "amor",
    slug: "amor-e-relacionamentos",
    label: "Amor e relacionamentos",
    title: "Amor e relacionamentos",
    text: "Para refletir sobre sentimentos, afastamentos, conexões, ciclos e posicionamentos afetivos.",
    icon: "heart",
    image: {
      avif: "/brand/tema-amor.avif",
      webp: "/brand/tema-amor.webp",
      small: "/brand/tema-amor-540.webp",
      alt: "A carta Os Enamorados sobre veludo roxo, cercada por velas e ametista, representando leituras sobre amor e relacionamentos",
      heroWebp: "/brand/tema-amor-hero.webp",
      heroAvif: "/brand/tema-amor-hero.avif",
    },
    page: {
      eyebrow: "Leitura por tema",
      title: "Amor e relacionamentos",
      intro:
        "Uma leitura para quem precisa entender o próprio lugar dentro de uma relação: o que sente, o que aceita, o que já não cabe e o que ainda merece atenção.",
      observe: [
        "O momento emocional em que a relação se encontra",
        "Sentimentos que ainda não foram nomeados",
        "Padrões que se repetem em diferentes vínculos",
        "Distâncias, silêncios e mudanças de ritmo",
        "Seus limites e a forma como você tem se posicionado",
      ],
      questions: [
        "O que preciso compreender sobre esta relação?",
        "O que estou deixando de enxergar neste vínculo?",
        "Como posso me posicionar melhor nesta situação?",
        "Que padrão afetivo está se repetindo comigo?",
        "O que merece atenção antes de eu tomar uma decisão?",
      ],
      boundary:
        "Uma leitura não comprova o que outra pessoa pensa ou sente, não promete reconciliação e não afirma traição. O foco está em você e nas suas escolhas.",
      seoTitle: "Tarô para Amor e Relacionamentos | Entre Nós Tarô",
      seoDescription:
        "Leitura de tarô online sobre sentimentos, afastamentos, ciclos e posicionamentos afetivos. Individual, confidencial e entregue pelo WhatsApp.",
    },
    quiz: {
      questions: [
        {
          id: "amor-1",
          question: "Como você tem se sentido em relação a essa situação afetiva?",
          options: [
            { label: "Em dúvida sobre o que realmente sinto", tag: "clareza" },
            { label: "Com medo de me machucar de novo", tag: "seguranca" },
            { label: "Sinto que estou repetindo o mesmo padrão", tag: "ciclo" },
            { label: "Esperançoso(a), mas sem saber o próximo passo", tag: "coragem" },
          ],
        },
        {
          id: "amor-2",
          question: "O que mais pesa nesse momento?",
          options: [
            { label: "Uma decisão sobre continuar ou não", tag: "clareza" },
            { label: "Sentimentos que ainda não foram ditos", tag: "seguranca" },
            { label: "A sensação de estar sempre no mesmo lugar", tag: "ciclo" },
            { label: "A vontade de recomeçar, mas sem coragem", tag: "coragem" },
          ],
        },
        {
          id: "amor-3",
          question: "O que você espera encontrar com mais clareza?",
          options: [
            { label: "Um caminho para seguir", tag: "clareza" },
            { label: "Confiança para me posicionar", tag: "seguranca" },
            { label: "Entender o que se repete e por quê", tag: "ciclo" },
            { label: "Coragem para dar o próximo passo", tag: "coragem" },
          ],
        },
      ],
      results: {
        clareza: {
          title: "Uma encruzilhada emocional",
          text: "As cartas costumam apontar, nesse tipo de situação, um momento de encruzilhada — antes de decidir, pode valer observar o que realmente pesa na balança quando o medo sai da equação.",
        },
        seguranca: {
          title: "Uma confiança em reconstrução",
          text: "Há sinais de que a confiança nessa relação — ou em você mesmo(a) dentro dela — pede reconstrução. Isso costuma vir acompanhado de perguntas específicas sobre limites e posicionamento.",
        },
        ciclo: {
          title: "Um padrão que se repete",
          text: "Um padrão parece aparecer mais de uma vez nessa história. Nem sempre é sobre a outra pessoa — às vezes é sobre o papel que você tem ocupado nesse tipo de situação.",
        },
        coragem: {
          title: "Uma energia pronta para o movimento",
          text: "A energia em torno dessa questão parece pronta para o movimento, mas ainda falta um pouco de clareza para saber em que direção seguir.",
        },
      },
    },
  },
  {
    id: "decisoes",
    slug: "decisoes-e-caminhos",
    label: "Decisões e caminhos",
    title: "Decisões e caminhos",
    text: "Para observar possibilidades antes de escolher uma direção importante.",
    icon: "compass",
    image: {
      avif: "/brand/tema-decisoes.avif",
      webp: "/brand/tema-decisoes.webp",
      small: "/brand/tema-decisoes-540.webp",
      alt: "A carta Dois de Paus sobre veludo roxo, cercada por velas e cristais, representando leituras sobre decisões e caminhos",
      heroWebp: "/brand/tema-decisoes-hero.webp",
      heroAvif: "/brand/tema-decisoes-hero.avif",
    },
    page: {
      eyebrow: "Leitura por tema",
      title: "Decisões e caminhos",
      intro:
        "Uma leitura para o momento anterior à escolha: quando existe mais de um caminho possível e falta clareza sobre o que cada um pede de você.",
      observe: [
        "O que pesa em cada possibilidade em análise",
        "Receios que estão influenciando a escolha",
        "O que já está claro e o que ainda precisa amadurecer",
        "O custo e o ganho de adiar a decisão",
        "Aspectos práticos que ainda não foram considerados",
      ],
      questions: [
        "Que aspectos estão dificultando esta decisão?",
        "O que devo observar antes de seguir por este caminho?",
        "O que ainda não estou conseguindo perceber?",
        "Qual energia influencia este momento?",
        "O que muda se eu esperar um pouco mais?",
      ],
      boundary:
        "As cartas apresentam perspectivas, não garantem resultados. A decisão continua sendo sua, e nenhuma leitura substitui orientação jurídica ou financeira.",
      seoTitle: "Tarô para Decisões e Caminhos | Entre Nós Tarô",
      seoDescription:
        "Leitura de tarô online para observar possibilidades antes de uma escolha importante. Individual, confidencial e entregue pelo WhatsApp.",
    },
    quiz: {
      questions: [
        {
          id: "decisoes-1",
          question: "O que descreve melhor esse momento de decisão?",
          options: [
            { label: "Tenho mais de um caminho e não sei qual escolher", tag: "clareza" },
            { label: "Tenho medo de escolher errado", tag: "seguranca" },
            { label: "Já adiei essa decisão várias vezes", tag: "ciclo" },
            { label: "Sei o que quero, mas falta coragem para agir", tag: "coragem" },
          ],
        },
        {
          id: "decisoes-2",
          question: "O que mais influencia essa escolha?",
          options: [
            { label: "Fatores práticos que ainda não estão claros", tag: "clareza" },
            { label: "O que as outras pessoas vão pensar ou dizer", tag: "seguranca" },
            { label: "Decisões parecidas que não deram certo antes", tag: "ciclo" },
            { label: "O tempo que essa decisão está tomando", tag: "coragem" },
          ],
        },
        {
          id: "decisoes-3",
          question: "O que ajudaria você a decidir com mais tranquilidade?",
          options: [
            { label: "Enxergar cada caminho com mais clareza", tag: "clareza" },
            { label: "Confiar mais na própria escolha", tag: "seguranca" },
            { label: "Entender por que costumo travar nesse tipo de decisão", tag: "ciclo" },
            { label: "Ter um empurrão para agir", tag: "coragem" },
          ],
        },
      ],
      results: {
        clareza: {
          title: "Um caminho ainda não totalmente revelado",
          text: "As cartas costumam sugerir, nesses casos, que os caminhos em análise ainda não estão totalmente claros — pode haver uma informação ou sentimento que ainda precisa vir à tona antes da escolha.",
        },
        seguranca: {
          title: "O peso da opinião alheia",
          text: "Parece que a opinião das outras pessoas está pesando mais do que deveria nessa decisão. Vale observar o que é realmente seu dentro dela.",
        },
        ciclo: {
          title: "Um adiamento que se repete",
          text: "Esse não parece ser o primeiro momento em que uma escolha assim fica parada. Pode haver um padrão de adiamento que merece atenção.",
        },
        coragem: {
          title: "Uma decisão mais clara do que parece",
          text: "A decisão em si já parece mais clara do que você imagina — o que costuma faltar, nesses casos, é o passo de colocá-la em prática.",
        },
      },
    },
  },
  {
    id: "trabalho",
    slug: "trabalho-e-vida-profissional",
    label: "Trabalho e vida profissional",
    title: "Trabalho e vida profissional",
    text: "Para compreender mudanças, oportunidades, bloqueios e movimentos profissionais.",
    icon: "briefcase",
    image: {
      avif: "/brand/tema-trabalho.avif",
      webp: "/brand/tema-trabalho.webp",
      small: "/brand/tema-trabalho-540.webp",
      alt: "A carta O Oito de Pentáculos sobre veludo roxo, cercada por velas e cristais, representando leituras sobre trabalho e vida profissional",
      heroWebp: "/brand/tema-trabalho-hero.webp",
      heroAvif: "/brand/tema-trabalho-hero.avif",
    },
    page: {
      eyebrow: "Leitura por tema",
      title: "Trabalho e vida profissional",
      intro:
        "Uma leitura para momentos de transição, estagnação ou dúvida na vida profissional — quando é preciso enxergar o cenário antes de agir.",
      observe: [
        "O momento atual do seu trabalho ou projeto",
        "Bloqueios que vêm se repetindo",
        "Oportunidades que estão em movimento",
        "Relações e ambientes que influenciam o seu desempenho",
        "O que precisa de preparo antes de uma mudança",
      ],
      questions: [
        "O que merece mais atenção na minha vida profissional?",
        "O que está bloqueando o meu avanço agora?",
        "O que devo considerar antes desta mudança?",
        "Qual postura tende a me favorecer neste ambiente?",
        "O que estou repetindo que já não funciona?",
      ],
      boundary:
        "A leitura não faz projeções financeiras, não indica investimentos e não substitui orientação profissional, contábil ou jurídica.",
      seoTitle: "Tarô para Trabalho e Vida Profissional | Entre Nós Tarô",
      seoDescription:
        "Leitura de tarô online sobre mudanças, oportunidades e bloqueios profissionais. Individual, confidencial e entregue pelo WhatsApp.",
    },
    quiz: {
      questions: [
        {
          id: "trabalho-1",
          question: "O que descreve seu momento profissional agora?",
          options: [
            { label: "Uma mudança que ainda não sei se devo fazer", tag: "clareza" },
            { label: "Insegurança sobre meu valor ou capacidade", tag: "seguranca" },
            { label: "A sensação de estar estagnado(a) no mesmo lugar", tag: "ciclo" },
            { label: "Uma oportunidade que ainda não tive coragem de buscar", tag: "coragem" },
          ],
        },
        {
          id: "trabalho-2",
          question: "O que mais pesa no seu trabalho ou carreira hoje?",
          options: [
            { label: "Falta de direção sobre o próximo passo", tag: "clareza" },
            { label: "Medo de não corresponder às expectativas", tag: "seguranca" },
            { label: "Bloqueios que se repetem em diferentes momentos", tag: "ciclo" },
            { label: "Vontade de mudar, mas sem saber por onde começar", tag: "coragem" },
          ],
        },
        {
          id: "trabalho-3",
          question: "O que ajudaria a enxergar esse momento com mais clareza?",
          options: [
            { label: "Entender qual caminho profissional faz mais sentido", tag: "clareza" },
            { label: "Reconhecer meu valor com mais segurança", tag: "seguranca" },
            { label: "Perceber o que se repete e por quê", tag: "ciclo" },
            { label: "Coragem para dar o primeiro passo", tag: "coragem" },
          ],
        },
      ],
      results: {
        clareza: {
          title: "Um cenário ainda em definição",
          text: "Há indícios de que o cenário profissional ainda não está totalmente definido — pode ser um bom momento para observar informações que ainda faltam antes de decidir.",
        },
        seguranca: {
          title: "Uma confiança a ser reconhecida",
          text: "As cartas costumam apontar, nesses casos, uma relação de confiança abalada — seja com o ambiente de trabalho, seja com a própria capacidade. Vale observar de onde vem essa insegurança.",
        },
        ciclo: {
          title: "Um bloqueio que se repete",
          text: "Parece haver um bloqueio que se repete em diferentes contextos profissionais. Entender esse padrão pode abrir espaço para o próximo movimento.",
        },
        coragem: {
          title: "Uma oportunidade já dada",
          text: "O momento parece pedir ação mais do que reflexão — a oportunidade já parece estar dada, e o que falta é o passo de buscá-la.",
        },
      },
    },
  },
  {
    id: "autoconhecimento",
    slug: "autoconhecimento",
    label: "Autoconhecimento",
    title: "Autoconhecimento",
    text: "Para identificar padrões, ciclos emocionais e aspectos internos que merecem atenção.",
    icon: "lotus",
    image: {
      avif: "/brand/tema-autoconhecimento.avif",
      webp: "/brand/tema-autoconhecimento.webp",
      small: "/brand/tema-autoconhecimento-540.webp",
      alt: "A carta O Eremita sobre veludo roxo, cercada por velas e cristais, representando leituras sobre autoconhecimento",
      heroWebp: "/brand/tema-autoconhecimento-hero.webp",
      heroAvif: "/brand/tema-autoconhecimento-hero.avif",
    },
    page: {
      eyebrow: "Leitura por tema",
      title: "Autoconhecimento",
      intro:
        "Uma leitura mais interna, para quem quer entender os próprios ciclos: o que se repete, o que cansa, o que pede cuidado e o que já está pronto para mudar.",
      observe: [
        "Ciclos emocionais que vêm se repetindo",
        "Aspectos seus que pedem mais atenção agora",
        "O que tem consumido a sua energia",
        "Movimentos internos que já começaram",
        "O que ajuda você a se reorganizar neste momento",
      ],
      questions: [
        "Que padrão está se repetindo na minha vida?",
        "O que em mim pede mais atenção agora?",
        "O que tem consumido a minha energia?",
        "O que já mudou em mim e eu ainda não reconheci?",
        "Qual energia influencia este momento?",
      ],
      boundary:
        "A leitura é um espaço de reflexão e não realiza diagnóstico médico ou psicológico. Ela não substitui acompanhamento de saúde mental.",
      seoTitle: "Tarô para Autoconhecimento | Entre Nós Tarô",
      seoDescription:
        "Leitura de tarô online para identificar padrões, ciclos emocionais e aspectos internos que merecem atenção. Individual e confidencial.",
    },
    quiz: {
      questions: [
        {
          id: "auto-1",
          question: "O que você sente que precisa compreender melhor sobre si mesmo(a)?",
          options: [
            { label: "Um padrão que se repete e eu não entendo bem", tag: "ciclo" },
            { label: "O que realmente sinto sobre determinada situação", tag: "clareza" },
            { label: "Por que tenho dificuldade de confiar em mim", tag: "seguranca" },
            { label: "Por que não consigo agir mesmo sabendo o que quero", tag: "coragem" },
          ],
        },
        {
          id: "auto-2",
          question: "O que mais tem consumido sua energia ultimamente?",
          options: [
            { label: "Pensamentos que não param de se repetir", tag: "ciclo" },
            { label: "A falta de clareza sobre o que sinto", tag: "clareza" },
            { label: "A insegurança em relação às próprias escolhas", tag: "seguranca" },
            { label: "A vontade de mudar sem saber por onde começar", tag: "coragem" },
          ],
        },
        {
          id: "auto-3",
          question: "O que ajudaria você a se conhecer melhor agora?",
          options: [
            { label: "Entender os ciclos que se repetem", tag: "ciclo" },
            { label: "Ter mais clareza sobre meus sentimentos", tag: "clareza" },
            { label: "Confiar mais nas minhas próprias escolhas", tag: "seguranca" },
            { label: "Coragem para agir de forma diferente", tag: "coragem" },
          ],
        },
      ],
      results: {
        ciclo: {
          title: "Um padrão emocional recorrente",
          text: "Existe um padrão emocional que parece se repetir em diferentes momentos da sua vida — reconhecê-lo já costuma ser parte importante do processo.",
        },
        clareza: {
          title: "Sentimentos ainda por nomear",
          text: "Suas respostas sugerem uma busca por nomear sentimentos que ainda estão um pouco confusos. Colocar isso em palavras costuma ser o primeiro passo.",
        },
        seguranca: {
          title: "Uma confiança em si a ser cultivada",
          text: "Parece haver uma relação de desconfiança com as próprias escolhas. Vale observar de onde vem essa insegurança e o que a alimenta.",
        },
        coragem: {
          title: "Uma percepção pronta para virar ação",
          text: "Você parece já saber, no fundo, o que precisa mudar — o que costuma faltar é o espaço para transformar essa percepção em ação.",
        },
      },
    },
  },
];

export const getThemeBySlug = (slug: string): ReadingTheme | undefined =>
  themes.find((theme) => theme.slug === slug);

export const themePath = (theme: ReadingTheme): string => `/leituras/${theme.slug}`;

/** Opções de tema apresentadas dentro do modal (inclui "Outro tema"). */
export const themeOptions: { id: ThemeId; label: string }[] = [
  ...themes.map((t) => ({ id: t.id, label: t.label })),
  { id: "outro", label: "Outro tema" },
];

export const getThemeLabel = (id: ThemeId | null): string =>
  themeOptions.find((t) => t.id === id)?.label ?? "Não informado";

/* ───────────────────────── Experiências rápidas ──────────────────────────
 *
 * Produtos avulsos, de preço único — não fazem parte de nenhum tema e não
 * têm escolha de pacote. Aparecem como banner logo após a hero da home e
 * cada um tem sua própria página em /experiencias/{slug}.
 * ────────────────────────────────────────────────────────────────────────── */

export type QuickProductId = "carta-canalizada" | "jogo-da-semana";

export interface QuickProduct {
  id: QuickProductId;
  slug: string;
  name: string;
  /** Rótulo curto usado nos eventos do pixel (sem acento, snake_case). */
  eventName: string;
  price: number;
  priceLabel: string;
  /** Textos do card no banner da home. */
  banner: {
    title: string;
    text: string;
    icon: "sparkles" | "calendar";
  };
  /** Se true, a página pergunta o quiz de reflexão antes do resumo. */
  hasQuiz: boolean;
  /** Se true, a etapa de detalhes pede um campo de contexto opcional. */
  collectContext: boolean;
  quiz?: {
    questions: QuizQuestion[];
    results: Record<ResultTag, QuizResult>;
  };
  page: {
    eyebrow: string;
    title: string;
    intro: string;
    observe: string[];
    seoTitle: string;
    seoDescription: string;
  };
}

export const quickProducts: QuickProduct[] = [
  {
    id: "carta-canalizada",
    slug: "carta-canalizada",
    name: "Carta Canalizada",
    eventName: "carta_canalizada",
    price: 20,
    priceLabel: "R$ 20,00",
    banner: {
      title: "Carta Canalizada",
      text: "Uma mensagem preparada especialmente para o seu momento.",
      icon: "sparkles",
    },
    hasQuiz: false,
    collectContext: false,
    page: {
      eyebrow: "Experiência rápida",
      title: "Carta Canalizada",
      intro:
        "Uma leitura espiritual e objetiva: uma carta é retirada especialmente para você e traz uma mensagem sobre o momento que está vivendo — sem que você precise escrever perguntas.",
      observe: [
        "Uma mensagem geral sobre o seu momento atual",
        "Um ponto de atenção trazido pela carta",
        "Uma energia para observar nos próximos dias",
      ],
      seoTitle: "Carta Canalizada | Entre Nós Tarô",
      seoDescription:
        "Receba uma mensagem espiritual através de uma carta canalizada especialmente para o seu momento. Individual, confidencial e entregue pelo WhatsApp.",
    },
  },
  {
    id: "jogo-da-semana",
    slug: "jogo-da-semana",
    name: "Jogo da Semana",
    eventName: "jogo_da_semana",
    price: 25,
    priceLabel: "R$ 25,00",
    banner: {
      title: "Jogo da Semana",
      text: "Energias e possibilidades para os próximos sete dias.",
      icon: "calendar",
    },
    hasQuiz: true,
    collectContext: true,
    page: {
      eyebrow: "Experiência rápida",
      title: "Jogo da Semana",
      intro:
        "Uma leitura para observar as energias e possibilidades da sua semana — útil para quem quer se planejar com mais consciência para os próximos dias.",
      observe: [
        "As energias gerais da sua semana",
        "Pontos de atenção em diferentes áreas da vida",
        "Boas oportunidades para observar nos próximos dias",
      ],
      seoTitle: "Jogo da Semana | Entre Nós Tarô",
      seoDescription:
        "Leitura de tarô sobre as energias e possibilidades dos próximos sete dias. Individual, confidencial e entregue pelo WhatsApp.",
    },
    quiz: {
      questions: [
        {
          id: "semana-1",
          question: "O que mais está em movimento na sua vida essa semana?",
          options: [
            { label: "Uma decisão que preciso tomar", tag: "clareza" },
            { label: "Uma insegurança que quero superar", tag: "seguranca" },
            { label: "A sensação de estar sempre correndo atrás da mesma coisa", tag: "ciclo" },
            { label: "Uma mudança que quero começar a colocar em prática", tag: "coragem" },
          ],
        },
        {
          id: "semana-2",
          question: "Como você chega nessa semana?",
          options: [
            { label: "Com dúvidas sobre o que priorizar", tag: "clareza" },
            { label: "Precisando de mais confiança para seguir", tag: "seguranca" },
            { label: "Sentindo que os dias se repetem", tag: "ciclo" },
            { label: "Com vontade de agir diferente", tag: "coragem" },
          ],
        },
        {
          id: "semana-3",
          question: "O que ajudaria a aproveitar melhor os próximos dias?",
          options: [
            { label: "Enxergar com mais clareza o que fazer primeiro", tag: "clareza" },
            { label: "Confiar mais nas próprias escolhas", tag: "seguranca" },
            { label: "Perceber o que está se repetindo", tag: "ciclo" },
            { label: "Ter coragem para experimentar algo novo", tag: "coragem" },
          ],
        },
      ],
      results: {
        clareza: {
          title: "Uma semana de decisões",
          text: "A energia da semana costuma favorecer momentos de escolha — pode ser um bom período para observar prioridades antes de se comprometer com tudo ao mesmo tempo.",
        },
        seguranca: {
          title: "Uma semana para fortalecer a confiança",
          text: "Os próximos dias parecem pedir mais confiança nas próprias escolhas — pequenas decisões tomadas com mais segurança tendem a render bons resultados.",
        },
        ciclo: {
          title: "Uma semana para observar repetições",
          text: "Pode ser uma boa semana para notar o que anda se repetindo no seu dia a dia — às vezes um pequeno ajuste de rotina já muda o resultado.",
        },
        coragem: {
          title: "Uma semana de movimento",
          text: "A energia da semana parece favorecer quem se permite experimentar algo novo — pequenos passos já tendem a abrir caminho.",
        },
      },
    },
  },
];

export const getQuickProductBySlug = (slug: string): QuickProduct | undefined =>
  quickProducts.find((product) => product.slug === slug);

export const quickProductPath = (product: QuickProduct): string => `/experiencias/${product.slug}`;

/* ─────────────────────────── Formatos de entrega ────────────────────────── */

export type FormatId = "texto" | "audio" | "indefinido";

export const formatOptions: { id: FormatId; label: string }[] = [
  { id: "texto", label: "Texto" },
  { id: "audio", label: "Áudio" },
  { id: "indefinido", label: "Ainda não sei" },
];

export const getFormatLabel = (id: FormatId | null): string =>
  formatOptions.find((f) => f.id === id)?.label ?? "A definir";

/* ────────────────────────────── Navegação ──────────────────────────────── */

export const navLinks = [
  { label: "Início", href: "#inicio" },
  { label: "Leituras", href: "#temas" },
  { label: "Como funciona", href: "#como-funciona" },
  // Aponta para a prévia da leitura — a seção "O que esperar" saiu da home.
  { label: "Experiência", href: "#previa" },
  { label: "Dúvidas", href: "#duvidas" },
] as const;

export const sectionIds = {
  hero: "inicio",
  quickProducts: "experiencias-rapidas",
  themes: "temas",
  howItWorks: "como-funciona",
  packages: "pacotes",
  questions: "perguntas",
  preview: "previa",
  experience: "experiencia",
  faq: "duvidas",
} as const;

/* ─────────────────────────── Textos principais ─────────────────────────── */

export const copy = {
  hero: {
    badge: "Leituras online, individuais e confidenciais",
    titleStart: "Algumas respostas",
    titleHighlight: "não chegam pela lógica",
    titleEnd: ".",
    text: "Organize suas perguntas e receba uma leitura preparada para oferecer novas perspectivas sobre sentimentos, decisões e caminhos.",
    primaryCta: "Escolher minha leitura",
    secondaryCta: "Entender como funciona",
    trust: ["Atendimento online pelo WhatsApp", "Privacidade", "Leitura individual"],
  },

  trustIndicators: [
    {
      icon: "message" as const,
      title: "Atendimento pelo WhatsApp",
      text: "Todo o processo acontece por conversa direta, sem aplicativos extras.",
    },
    {
      icon: "user" as const,
      title: "Leitura individual",
      text: "Cada leitura é preparada a partir das perguntas que você enviar.",
    },
    {
      icon: "lock" as const,
      title: "Conteúdo confidencial",
      text: "O que é compartilhado no atendimento é tratado com discrição.",
    },
  ],

  marquee: [
    "Amor e relacionamentos",
    "Decisões e caminhos",
    "Vida profissional",
    "Autoconhecimento",
    "Energia do momento",
  ],

  themes: {
    eyebrow: "Para cada momento, uma nova perspectiva",
    title: "Qual situação está ocupando seus pensamentos?",
    text: "Escolha o tema que mais se aproxima do que você deseja compreender.",
    cardCta: "Perguntar sobre este tema",
  },

  themePage: {
    observeTitle: "O que esta leitura ajuda a observar",
    questionsTitle: "Exemplos de perguntas para este tema",
    boundaryTitle: "O que esta leitura não faz",
    otherThemesTitle: "Outros temas de leitura",
    backToHome: "Voltar ao início",
    heroCta: "Escolher minha leitura",
    heroSecondary: "Entender como funciona",
  },

  howItWorks: {
    eyebrow: "Simples, individual e confidencial",
    title: "Sua leitura em três etapas",
    steps: [
      {
        title: "Escolha seu pacote",
        text: "Selecione a quantidade de perguntas que melhor atende ao seu momento.",
      },
      {
        title: "Envie suas perguntas",
        text: "Depois da confirmação, organize e envie suas perguntas pelo WhatsApp.",
      },
      {
        title: "Receba sua leitura",
        text: "A leitura será preparada e entregue no formato e prazo informados.",
      },
    ],
  },

  packages: {
    eyebrow: "Escolha sua experiência",
    title: "Quantas respostas você precisa neste momento?",
    text: "Escolha o pacote que melhor combina com a quantidade de situações que deseja compreender.",
    notes: [
      `Entrega estimada: ${commercial.deliveryTime}`,
      "Atendimento online",
      `Pagamento por ${commercial.paymentMethod}`,
      "As perguntas são enviadas após a confirmação",
    ],
  },

  questionExamples: {
    title: "O que você pode perguntar?",
    text: "As perguntas funcionam melhor quando ajudam você a observar a situação e o seu próprio posicionamento.",
    items: [
      "O que preciso compreender sobre esta relação?",
      "Que aspectos estão dificultando esta decisão?",
      "O que devo observar antes de seguir por este caminho?",
      "Que padrão está se repetindo na minha vida?",
      "Como posso me posicionar melhor nesta situação?",
      "O que merece mais atenção na minha vida profissional?",
      "Qual energia influencia este momento?",
      "O que ainda não estou conseguindo perceber?",
    ],
    disclaimer:
      "Não realizamos diagnósticos médicos ou psicológicos, previsões de morte, orientação jurídica ou financeira, jogos de azar ou promessas de resultado garantido.",
  },

  preview: {
    eyebrow: "Veja como você receberá",
    title: "Uma interpretação clara e preparada para suas perguntas",
    cardName: "A Sacerdotisa",
    cardLabel: "Carta central",
    interpretation:
      "Esta carta pode indicar que existem sentimentos ou informações que ainda não estão totalmente visíveis. Antes de tomar uma decisão, talvez seja importante observar o que a sua própria percepção vem mostrando e quais pontos ainda precisam de confirmação.",
    tags: [
      "Interpretação personalizada",
      "Linguagem clara",
      "Foto das cartas",
      "Entrega pelo WhatsApp",
      "Conteúdo confidencial",
    ],
    note: "Exemplo ilustrativo. Cada leitura é preparada a partir das perguntas enviadas.",

    /** Conteúdo da conversa demonstrativa exibida no celular. */
    chat: {
      statusBarTime: "21:39",
      contactStatus: "online",
      dayChip: "Hoje",
      sent: {
        text: "Enviei minhas perguntas. Fico no aguardo!",
        time: "20:02",
      },
      photo: {
        src: "/brand/tema-decisoes-540.webp",
        alt: "Foto das cartas de tarô abertas para a leitura",
        caption: "Foto das cartas da sua leitura",
        time: "21:37",
      },
      reading: { time: "21:38" },
      audio: {
        duration: "0:47",
        label: "Mensagem de áudio com a síntese da leitura",
        time: "21:39",
      },
      inputPlaceholder: "Mensagem",
    },
  },

  differentials: {
    eyebrow: "Como conduzimos",
    title: "Uma leitura preparada para o seu momento",
    items: [
      {
        title: "Sem respostas genéricas",
        text: "Cada leitura considera as perguntas e o tema apresentados.",
      },
      {
        title: "Atendimento confidencial",
        text: "As informações compartilhadas devem ser tratadas com discrição.",
      },
      {
        title: "Clareza sem julgamentos",
        text: "A experiência apresenta perspectivas de forma respeitosa e acolhedora.",
      },
      {
        title: "O caminho continua sendo seu",
        text: "As cartas oferecem pontos de reflexão, mas não tomam decisões pelo cliente.",
      },
    ],
  },

  whatToExpect: {
    eyebrow: "A experiência",
    title: "O que você pode esperar da experiência",
    text: "Um atendimento conduzido com cuidado, do primeiro contato até a entrega da leitura.",
    items: [
      { title: "Organização", text: "Suas perguntas são recebidas e organizadas antes da leitura." },
      { title: "Objetividade", text: "Interpretações diretas, sem rodeios e sem termos herméticos." },
      { title: "Acolhimento", text: "Um espaço respeitoso para falar do que ainda não tem nome." },
      { title: "Privacidade", text: "Atendimento individual e conteúdo tratado com discrição." },
      { title: "Respostas claras", text: "Linguagem simples, para que a leitura seja realmente útil." },
      {
        title: "Uma leitura relacionada às suas perguntas",
        text: "O que você perguntou é o que orienta a interpretação das cartas.",
      },
    ],
  },

  finalCta: {
    title: "Sua dúvida pode ser o início de uma nova perspectiva.",
    text: "Escolha a quantidade de perguntas e continue pelo WhatsApp para confirmar sua leitura.",
    button: "Escolher minha leitura",
    note: "Atendimento online, individual e confidencial.",
  },

  faq: {
    eyebrow: "Dúvidas frequentes",
    title: "Perguntas frequentes",
    items: [
      {
        q: "Como receberei minha leitura?",
        a: "A leitura será entregue pelo WhatsApp no formato correspondente ao pacote escolhido.",
      },
      {
        q: "Em quanto tempo receberei?",
        a: `O prazo estimado é ${commercial.deliveryTime} e será confirmado antes do pagamento.`,
      },
      {
        q: "Quando envio minhas perguntas?",
        a: "As perguntas são enviadas pelo WhatsApp depois da confirmação do pacote e do pagamento.",
      },
      {
        q: "Posso perguntar sobre qualquer assunto?",
        a: "As leituras podem abordar sentimentos, decisões, vida profissional, autoconhecimento e outros temas de reflexão. Não realizamos diagnóstico médico, aconselhamento jurídico ou financeiro, previsão de morte ou orientação para jogos de azar.",
      },
      {
        q: "As cartas garantem que algo acontecerá?",
        a: "Não. O tarô apresenta símbolos, possibilidades e perspectivas relacionadas ao momento atual. Nenhum resultado futuro pode ser garantido.",
      },
      {
        q: "Posso perguntar sobre outra pessoa?",
        a: "As perguntas devem priorizar a forma como a situação afeta você, seus sentimentos, suas escolhas e seus limites. Uma leitura não comprova como outra pessoa pensa ou age.",
      },
      {
        q: "Posso alterar as perguntas depois de enviá-las?",
        a: "As perguntas poderão ser ajustadas antes do início da preparação da leitura. Depois que o atendimento começar, alterações poderão ser consideradas novas perguntas.",
      },
      {
        q: "Como faço o pagamento?",
        a: `O pagamento é realizado por ${commercial.paymentMethod}. Os dados serão enviados pelo atendimento oficial da Entre Nós Tarô.`,
      },
      {
        q: "A consulta é confidencial?",
        a: "Sim. O conteúdo compartilhado durante o atendimento deve ser tratado com discrição.",
      },
    ],
  },

  modal: {
    step1: {
      title: "Pacote selecionado",
      question: "Este é o pacote que você deseja?",
      confirm: "Sim, continuar",
      change: "Escolher outro pacote",
    },
    step2: {
      title: "Tema da leitura",
      question: "Qual tema melhor representa sua consulta?",
    },
    step3: {
      title: "Sua intenção",
      question: "O que você procura neste momento?",
      options: [
        { id: "conhecendo" as const, label: "Estou apenas conhecendo" },
        { id: "compreender" as const, label: "Quero compreender uma situação" },
        { id: "hoje" as const, label: "Quero realizar minha leitura hoje" },
      ],
      browsingMessage:
        "Tudo bem. Você pode conhecer melhor a experiência e voltar quando sentir que é o momento.",
      browsingPrimary: "Entender como funciona",
      browsingSecondary: "Continuar mesmo assim",
    },
    step4: {
      title: "Confirmação do valor",
      question: "O valor informado está dentro do que você procura?",
      options: [
        { id: "sim" as const, label: "Sim, quero continuar" },
        { id: "outro" as const, label: "Quero escolher outro pacote" },
        { id: "depois" as const, label: "Não neste momento" },
      ],
      declineMessage:
        "Tudo bem. Uma leitura deve acontecer quando também for confortável para você.",
    },
    step5: {
      title: "Identificação",
      nameLabel: "Primeiro nome",
      namePlaceholder: "Como podemos te chamar?",
      nameError: "Informe seu primeiro nome para continuar.",
      formatLabel: "Formato preferido da leitura",
      consentDeadline: `Estou ciente de que a entrega é estimada ${commercial.deliveryTime}.`,
      consentPrice: "Estou ciente do valor do pacote escolhido.",
      consentError: "Confirme os dois itens acima para continuar.",
      privacyNote:
        "Não pedimos aqui a sua pergunta, documentos, data de nascimento ou dados sensíveis. Esses assuntos ficam para o atendimento.",
      submit: "Continuar",
    },
    final: {
      title: "Sua leitura está quase confirmada",
      text: "Continue pelo WhatsApp para confirmar disponibilidade, pagamento e envio das perguntas.",
      button: "Continuar pelo WhatsApp",
    },
    back: "Voltar",
    close: "Fechar",
    progressLabel: "Progresso da qualificação",
  },

  /** Textos do funil interativo dentro de cada página de tema. */
  funnel: {
    startCta: "Começar minha reflexão",
    startNote: "Leva menos de um minuto.",
    quizProgressLabel: "Progresso da reflexão",
    summaryEyebrow: "O que as cartas sugerem",
    summaryNote:
      "Esta é apenas uma prévia. Uma leitura completa, com suas próprias perguntas, aprofunda esse olhar.",
    summaryCta: "Ver como aprofundar essa leitura",
    pricingEyebrow: "Escolha sua experiência",
    pricingTitle: "Quantas respostas você precisa neste momento?",
    pricingText: "Escolha o pacote que melhor combina com o que você deseja compreender agora.",
    detailsEyebrow: "Últimos detalhes",
    detailsTitle: "Suas perguntas para esta leitura",
    questionsLabel: "Escreva suas perguntas, uma por linha",
    questionsPlaceholder: "Ex.: O que preciso compreender sobre esta situação?",
    questionsHint: "Este pacote inclui",
    questionsError: "Escreva ao menos uma pergunta para continuar.",
    nameLabel: "Primeiro nome",
    namePlaceholder: "Como podemos te chamar?",
    nameError: "Informe seu primeiro nome para continuar.",
    formatLabel: "Formato preferido da leitura",
    consentDeadline: `Estou ciente de que a entrega é estimada ${commercial.deliveryTime}.`,
    consentPrice: "Estou ciente do valor do pacote escolhido.",
    consentError: "Confirme os dois itens acima para continuar.",
    submitCta: "Continuar para o WhatsApp",
    changePackage: "Escolher outro pacote",
    finalTitle: "Sua leitura está quase confirmada",
    finalText:
      "Revise as informações abaixo e envie pelo WhatsApp para confirmar disponibilidade e pagamento.",
    finalCta: "Enviar pelo WhatsApp",
    back: "Voltar",
  },

  /** Banner das experiências rápidas, logo após a hero da home. */
  quickProducts: {
    eyebrow: "Experiências rápidas",
    title: "Prefere algo mais direto?",
    text: "Duas experiências pontuais, sem escolher tema — ideais para quem quer uma resposta rápida.",
    cta: "Escolher esta experiência",
  },

  /** Textos do funil das experiências rápidas — reaproveita a maior parte de `funnel`. */
  quickFunnel: {
    startCta: "Continuar",
    summaryNote: "Esta é apenas uma prévia. A leitura completa aprofunda esse olhar.",
    summaryCta: "Continuar",
    detailsTitle: "Confirme suas informações",
    contextLabel: "O que gostaria de observar nesta leitura? (opcional)",
    contextPlaceholder: "Ex.: Quero entender melhor este momento.",
    submitCta: "Continuar para o WhatsApp",
  },

  consent: {
    text: "Utilizamos tecnologias de medição para entender o desempenho das campanhas. Você pode aceitar ou continuar sem essas métricas.",
    accept: "Aceitar métricas",
    decline: "Continuar sem métricas",
    title: "Métricas e privacidade",
  },

  mobileCta: "Escolher minha leitura",

  footer: {
    disclaimer:
      "O tarô é apresentado como uma ferramenta de reflexão e orientação. As leituras não substituem acompanhamento médico, psicológico, jurídico ou financeiro. As decisões continuam sendo responsabilidade do cliente.",
    ageNote: "Atendimento destinado a maiores de 18 anos.",
  },
} as const;

/* ─────────────────────────────── Links legais ──────────────────────────── */

export const legalLinks = [
  { label: "Política de privacidade", href: "/privacidade" },
  { label: "Termos de uso", href: "/termos" },
  { label: "Política de entrega", href: "/entrega" },
  { label: "Política de reembolso", href: "/reembolso" },
] as const;

/* ─────────────────────────────── Depoimentos ───────────────────────────── */

export interface Testimonial {
  name: string;
  text: string;
  packageName?: string;
}

/**
 * ⚠️ Nenhum depoimento é exibido enquanto este array estiver vazio.
 *
 * Adicione somente depoimentos REAIS e AUTORIZADOS pelo cliente.
 * Exemplo de formato (mantenha comentado até existir autorização):
 *
 *   { name: "Adicionar depoimento real autorizado.", text: "Adicionar depoimento real autorizado." }
 *
 * Enquanto o array estiver vazio, a seção "O que esperar" é exibida no lugar
 * e nenhum schema de avaliação é gerado para o Google.
 */
export const testimonials: Testimonial[] = [];

/* ────────────────────────────────── SEO ────────────────────────────────── */

export const seo = {
  title: "Entre Nós Tarô | Leituras de Tarô Online",
  description:
    "Leituras de tarô online, individuais e confidenciais para amor, decisões, vida profissional e autoconhecimento. Escolha suas perguntas e consulte pelo WhatsApp.",
  locale: "pt_BR",
  ogImage: brand.cover.og,
} as const;

/* ─────────────────────── Verificação em desenvolvimento ────────────────── */

export const pendingConfigFields = (): string[] => {
  const pending: string[] = [];
  if (isPlaceholder(contact.whatsappNumber)) pending.push("contact.whatsappNumber");
  if (isPlaceholder(contact.instagramHandle)) pending.push("contact.instagramHandle");
  if (isPlaceholder(contact.email)) pending.push("contact.email");
  if (isPlaceholder(analytics.metaPixelId)) pending.push("analytics.metaPixelId");
  return pending;
};

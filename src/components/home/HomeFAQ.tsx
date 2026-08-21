import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQ_ITEMS = [
  {
    q: "Como recebo o material depois da compra?",
    a: "O acesso é liberado automaticamente assim que o pagamento via Pix é confirmado. Os arquivos ficam disponíveis para download na própria página do produto.",
  },
  {
    q: "Em qual formato os materiais são entregues?",
    a: "Todos os materiais são digitais, em PDF, para consultar no computador, tablet ou celular.",
  },
  {
    q: "Posso comprar mais de um material na mesma compra?",
    a: "Sim. Alguns produtos oferecem materiais complementares na própria tela de compra.",
  },
  {
    q: "E se eu tiver algum problema para acessar o material?",
    a: "É só falar com o suporte pelos canais indicados na página do produto, informando o código do pedido.",
  },
];

export function HomeFAQ() {
  return (
    <section id="duvidas" className="bg-white py-16 sm:py-20">
      <div className="mx-auto w-full max-w-[820px] px-5 sm:px-6">
        <div className="flex flex-col gap-2 text-center">
          <span className="text-[12px] font-bold uppercase tracking-wide text-teal-700">Dúvidas frequentes</span>
          <h2 className="text-[1.75rem] font-extrabold tracking-tight text-slate-900 sm:text-[2rem]">
            Perguntas frequentes
          </h2>
        </div>

        <Accordion type="single" collapsible className="mt-9 flex flex-col gap-3">
          {FAQ_ITEMS.map((item, index) => (
            <AccordionItem key={item.q} value={`item-${index}`}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

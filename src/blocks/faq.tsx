import { m } from "@/paraglide/messages.js";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export type FaqItem = { question: string; answer: string };

/** FAQ entries, exported so the page can also emit FAQPage JSON-LD. */
export function getFaqItems(): FaqItem[] {
  return [
    {
      question: m["landing.faq.upload.question"](),
      answer: m["landing.faq.upload.answer"](),
    },
    {
      question: m["landing.faq.download.question"](),
      answer: m["landing.faq.download.answer"](),
    },
    {
      question: m["landing.faq.quality.question"](),
      answer: m["landing.faq.quality.answer"](),
    },
    {
      question: m["landing.faq.browser.question"](),
      answer: m["landing.faq.browser.answer"](),
    },
    {
      question: m["landing.faq.free.question"](),
      answer: m["landing.faq.free.answer"](),
    },
    {
      question: m["landing.faq.heic.question"](),
      answer: m["landing.faq.heic.answer"](),
    },
    {
      question: m["landing.faq.batch.question"](),
      answer: m["landing.faq.batch.answer"](),
    },
  ];
}

export function FAQ() {
  const items = getFaqItems();
  return (
    <section id="faq" className="px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-16">
          <h2 className="font-serif font-medium text-4xl sm:text-5xl tracking-tight">
            {m["landing.faq.title"]()}
          </h2>
          <p className="mt-5 text-muted-foreground">
            {m["landing.faq.description"]()}
          </p>
        </div>
        <Accordion className="w-full">
          {items.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="cursor-pointer py-6 text-left text-base font-medium hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="pb-6 text-muted-foreground leading-relaxed">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Footer } from '@/blocks/footer';
import { Header } from '@/blocks/header';
import { envConfigs } from '@/config';
import {
  getIntent,
  intentChrome,
  intentLinks,
  type IntentId,
} from '@/content/intents';
import { Link } from '@/core/i18n/navigation';
import { Remover } from '@/features/remover/remover';
import { localeAlternateLinks, shareMeta } from '@/lib/seo';
import { getLocale, localizeUrl } from '@/paraglide/runtime.js';

type IntentLoader = { locale: string };

function intentHead(id: IntentId, locale: string) {
  const copy = getIntent(id, locale);
  const canonical = localizeUrl(`${envConfigs.app_url}${copy.path}`, {
    locale: locale as ReturnType<typeof getLocale>,
  }).href;
  return {
    meta: shareMeta(`${copy.title} | ${envConfigs.app_name}`, copy.description, canonical),
    links: [
      { rel: 'canonical' as const, href: canonical },
      ...localeAlternateLinks(copy.path),
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: copy.faqs.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answer },
          })),
        }),
      },
    ],
  };
}

export function intentRoute(id: IntentId) {
  return {
    loader: (): IntentLoader => ({ locale: getLocale() }),
    head: ({ loaderData }: { loaderData?: IntentLoader }) =>
      intentHead(id, loaderData?.locale ?? 'en'),
    component: function IntentRoute() {
      return <IntentPage id={id} />;
    },
  };
}

export function IntentLinks({ current }: { current?: IntentId }) {
  const locale = getLocale();
  const { relatedHeading } = intentChrome(locale);
  const links = intentLinks(locale).filter((link) => link.id !== current);
  return (
    <nav
      aria-label={relatedHeading}
      className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm"
    >
      {links.map((link) => (
        <Link
          key={link.id}
          href={link.href}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function IntentPage({ id }: { id: IntentId }) {
  const locale = getLocale();
  const copy = getIntent(id, locale);
  const chrome = intentChrome(locale);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1">
        <section className="px-4 pt-16 pb-8 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-serif text-4xl leading-[1.1] tracking-tight sm:text-5xl">
              {copy.h1}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {copy.lead}
            </p>
          </div>
        </section>

        <section id="tool" className="scroll-mt-20 px-4 pb-12">
          <div className="mx-auto max-w-4xl">
            <Remover preset={copy.preset} />
          </div>
        </section>

        <section className="px-4 pb-20">
          <div className="mx-auto max-w-3xl">
            {copy.caution ? (
              <p className="rounded-2xl border border-border bg-muted/40 px-5 py-4 text-sm leading-relaxed text-foreground">
                {copy.caution}
              </p>
            ) : null}

            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{chrome.fitHeading}</h2>
                <p className="mt-2 leading-7 text-muted-foreground">{copy.fit}</p>
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{chrome.notFitHeading}</h2>
                <p className="mt-2 leading-7 text-muted-foreground">{copy.notFit}</p>
              </div>
            </div>

            <h2 className="mt-14 text-lg font-semibold tracking-tight">{chrome.faqHeading}</h2>
            <Accordion className="mt-2 w-full">
              {copy.faqs.map((item) => (
                <AccordionItem key={item.question} value={item.question}>
                  <AccordionTrigger className="cursor-pointer py-5 text-left text-base font-medium hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 leading-relaxed text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <div className="mt-12">
              <h2 className="mb-4 text-center text-sm font-medium text-muted-foreground">
                {chrome.relatedHeading}
              </h2>
              <IntentLinks current={id} />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { Header } from '@/blocks/header';
import { Hero } from '@/blocks/hero';
import { Features } from '@/blocks/features';
import { FAQ, getFaqItems } from '@/blocks/faq';
import { Blog } from '@/blocks/blog';
import { CTA } from '@/blocks/cta';
import { Footer } from '@/blocks/footer';
import { envConfigs } from '@/config';
import { getBlogPostsFn } from '@/content/posts/server';
import { Remover } from '@/features/remover/remover';
import { IntentLinks } from '@/features/intent/page';
import { localeAlternateLinks, shareMeta } from '@/lib/seo';
import { m } from '@/paraglide/messages.js';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';

function HomePage() {
  const { posts } = Route.useLoaderData();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <section id="tool" className="px-4 pb-24 scroll-mt-20">
          <div className="mx-auto max-w-4xl">
            <Remover />
            <div className="mt-8">
              <IntentLinks />
            </div>
          </div>
        </section>
        <Features />
        <FAQ />
        <Blog posts={posts} />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

export const Route = createFileRoute('/')({
  loader: async () => {
    const locale = getLocale();
    const posts = await getBlogPostsFn({ data: { locale, limit: 3 } });
    return { locale, posts };
  },
  head: ({ loaderData }) => {
    const locale = (loaderData?.locale ?? 'en') as (typeof locales)[number];
    const urlFor = (loc: string) =>
      localizeUrl(`${envConfigs.app_url}/`, {
        locale: loc as (typeof locales)[number],
      }).href;
    const title = m['landing.meta.title']({}, { locale });
    const description = m['landing.hero.subheadline']({}, { locale });
    const faq = getFaqItems();
    return {
      meta: [
        ...shareMeta(title, description, urlFor(locale)),
      ],
      links: [
        { rel: 'canonical', href: urlFor(locale) },
        ...localeAlternateLinks('/'),
      ],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: envConfigs.app_name,
              url: urlFor(locale),
              email: 'hello@cleanbg.app',
              applicationCategory: 'MultimediaApplication',
              operatingSystem: 'Any',
              browserRequirements: 'Requires a modern browser with WebAssembly',
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
              description,
            },
            {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: faq.map((f) => ({
                '@type': 'Question',
                name: f.question,
                acceptedAnswer: { '@type': 'Answer', text: f.answer },
              })),
            },
          ]),
        },
      ],
    };
  },
  component: HomePage,
});

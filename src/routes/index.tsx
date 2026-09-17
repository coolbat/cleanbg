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
            {/* Remover tool mounts here (client-only) */}
            <div className="rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
              {m['tool.dropzone.title']()}
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
    const title = `${envConfigs.app_name} — ${m['landing.hero.headline']({}, { locale })}`;
    const description = m['landing.hero.subheadline']({}, { locale });
    const faq = getFaqItems();
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: urlFor(locale) },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      links: [
        { rel: 'canonical', href: urlFor(locale) },
        ...locales.map((loc) => ({
          rel: 'alternate',
          hrefLang: loc,
          href: urlFor(loc),
        })),
        { rel: 'alternate', hrefLang: 'x-default', href: urlFor('en') },
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

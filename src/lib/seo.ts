import { envConfigs } from '@/config';
import { locales, localizeUrl } from '@/paraglide/runtime.js';

export function appOrigin(): string {
  return envConfigs.app_url.replace(/\/$/, '');
}

export function ogImageUrl(): string {
  return `${appOrigin()}/og.png`;
}

export function shareMeta(title: string, description: string, url: string) {
  const image = ogImageUrl();
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: envConfigs.app_name },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
  ];
}

/** hreflang links (including x-default) for a site path such as `/blog`. */
export function localeAlternateLinks(path: string) {
  const origin = appOrigin();
  const hrefFor = (locale: (typeof locales)[number]) =>
    localizeUrl(`${origin}${path || '/'}`, { locale }).href;
  return [
    ...locales.map((loc) => ({
      rel: 'alternate' as const,
      hrefLang: loc,
      href: hrefFor(loc),
    })),
    {
      rel: 'alternate' as const,
      hrefLang: 'x-default',
      href: hrefFor('en'),
    },
  ];
}

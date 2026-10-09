import type { ComponentType } from 'react';

import { baseLocale } from '@/paraglide/runtime.js';

/**
 * Local blog posts written as MDX files in this directory.
 * File naming: `<slug>.<locale>.mdx` (falls back to the base locale).
 * Register every local post slug here — it drives loading and the sitemap.
 *
 * This module is isomorphic (safe in client bundles). Database posts are
 * fetched through the server functions in ./server.ts and merged with the
 * local posts via the pure helpers below.
 */
export const BLOG_POST_SLUGS: readonly string[] = [
  'cleanbg-vs-remove-bg-and-canva',
  'remove-bg-shutting-down-alternative',
  'how-in-browser-background-removal-works',
  'no-upload-background-remover',
  'remove-background-from-product-photos',
  'batch-remove-backgrounds-in-browser',
];

export type BlogPostMeta = {
  title: string;
  description: string;
  created_at: string;
  author_name?: string;
  author_image?: string;
  image?: string;
};

type PostModule = {
  default: ComponentType;
  meta: BlogPostMeta;
};

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  image?: string;
  /** ISO date string — serializable across loader/server-fn boundaries */
  createdAt: string;
  authorName?: string;
  authorImage?: string;
  source: 'local';
};

export type BlogPostDetail = BlogPost;

// Eagerly bundle the local MDX posts (small markdown files), mirroring the
// static-pages pattern. Keys are absolute from the project root.
const postModules = import.meta.glob<PostModule>('/src/content/posts/*.mdx', {
  eager: true,
});

export function loadLocalPost(
  slug: string,
  locale: string
): PostModule | null {
  if (!BLOG_POST_SLUGS.includes(slug)) {
    return null;
  }
  return (
    postModules[`/src/content/posts/${slug}.${locale}.mdx`] ??
    postModules[`/src/content/posts/${slug}.${baseLocale}.mdx`] ??
    null
  );
}

function localPostToItem(slug: string, meta: BlogPostMeta): BlogPost {
  return {
    slug,
    title: meta.title,
    description: meta.description,
    image: meta.image,
    createdAt: new Date(meta.created_at).toISOString(),
    authorName: meta.author_name,
    authorImage: meta.author_image,
    source: 'local',
  };
}

/** All local posts for a locale, newest first. */
export function getLocalPosts(locale: string): BlogPost[] {
  return BLOG_POST_SLUGS.map((slug) => ({
    slug,
    mod: loadLocalPost(slug, locale),
  }))
    .filter((m): m is { slug: string; mod: PostModule } => m.mod !== null)
    .map(({ slug, mod }) => localPostToItem(slug, mod.meta))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export function formatPostDate(dateIso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: locale === 'zh' ? 'long' : 'short',
    day: 'numeric',
  }).format(new Date(dateIso));
}

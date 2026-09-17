import { createServerFn } from '@tanstack/react-start';

import type { BlogPostDetail } from './index';
import { getLocalPosts, loadLocalPost } from './index';

/**
 * All blog posts, newest first. Posts are local MDX files only — there is
 * no database behind this site.
 */
export const getBlogPostsFn = createServerFn()
  .inputValidator((data: { locale: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    const posts = getLocalPosts(data.locale);
    return data.limit ? posts.slice(0, data.limit) : posts;
  });

/**
 * Single blog post by slug. Returns meta only — the route component resolves
 * the MDX Content from the bundled glob map (components don't serialize).
 */
export const getBlogPostFn = createServerFn()
  .inputValidator((data: { slug: string; locale: string }) => data)
  .handler(async ({ data }): Promise<BlogPostDetail | null> => {
    const mod = loadLocalPost(data.slug, data.locale);
    if (!mod) return null;
    const meta = mod.meta;
    return {
      slug: data.slug,
      title: meta.title,
      description: meta.description,
      image: meta.image,
      createdAt: new Date(meta.created_at).toISOString(),
      authorName: meta.author_name,
      authorImage: meta.author_image,
      source: 'local',
    };
  });

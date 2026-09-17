import { ArrowRight } from 'lucide-react';

import { BlogCard } from '@/components/blog-card';
import type { BlogPost } from '@/content/posts';
import { formatPostDate } from '@/content/posts';
import { Link } from '@/core/i18n/navigation';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

// Latest-posts landing section. Posts arrive via props (fetched in the
// landing route's loader through the blog server functions) so this block
// stays free of database imports.
export function Blog({ posts }: { posts: BlogPost[] }) {
  const locale = getLocale();

  if (posts.length === 0) return null;

  return (
    <section id="blog" className="px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-20">
          <h2 className="font-serif font-normal text-4xl sm:text-5xl tracking-tight">
            {m['landing.blog.title']()}
          </h2>
          <p className="mt-5 text-muted-foreground max-w-lg mx-auto">
            {m['landing.blog.description']()}
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <BlogCard
              key={post.slug}
              href={`/blog/${post.slug}`}
              title={post.title}
              description={post.description}
              image={post.image}
              date={formatPostDate(post.createdAt, locale)}
              authorName={post.authorName}
              authorImage={post.authorImage}
            />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {m['landing.blog.view_all']()}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

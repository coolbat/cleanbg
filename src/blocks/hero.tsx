import { m } from "@/paraglide/messages.js";
import { ShieldCheck } from "lucide-react";
import { DotPattern } from "@/components/ui/dot-pattern";
import { cn } from "@/lib/utils";

/**
 * Landing hero: copy above the fold. The tool itself renders directly
 * below (see routes/index.tsx) so the first screen is copy + dropzone.
 */
export function Hero() {
  return (
    <section className="relative isolate flex flex-col items-center justify-center overflow-hidden px-4 pt-16 pb-10 sm:pt-24 sm:pb-12">
      <DotPattern
        className={cn(
          "[mask-image:radial-gradient(ellipse_at_center,white,transparent_75%)]",
          "text-foreground/15"
        )}
      />
      <div className="relative max-w-3xl text-center space-y-6">
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs tracking-wide text-muted-foreground backdrop-blur">
          <ShieldCheck className="size-3.5" />
          {m["landing.hero.eyebrow"]()}
        </p>
        <h1 className="font-serif font-normal text-4xl sm:text-5xl lg:text-6xl leading-[1.1] tracking-tight text-foreground">
          {m["landing.hero.headline"]()}
        </h1>
        <p className="text-base text-muted-foreground sm:text-lg max-w-2xl mx-auto leading-relaxed">
          {m["landing.hero.subheadline"]()}
        </p>
        <p className="text-xs text-muted-foreground/80">
          {m["landing.hero.note"]()}
        </p>
      </div>
    </section>
  );
}

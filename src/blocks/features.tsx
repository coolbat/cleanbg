import { m } from "@/paraglide/messages.js";
import {
  ShieldCheck,
  Infinity as InfinityIcon,
  Zap,
  Sparkles,
  WifiOff,
  Scale,
  type LucideIcon,
} from "lucide-react";

type Feature = { title: string; description: string; icon: LucideIcon };

export function Features() {
  const features: Feature[] = [
    {
      icon: ShieldCheck,
      title: m["landing.features.private.title"](),
      description: m["landing.features.private.description"](),
    },
    {
      icon: InfinityIcon,
      title: m["landing.features.free.title"](),
      description: m["landing.features.free.description"](),
    },
    {
      icon: Zap,
      title: m["landing.features.fast.title"](),
      description: m["landing.features.fast.description"](),
    },
    {
      icon: Sparkles,
      title: m["landing.features.quality.title"](),
      description: m["landing.features.quality.description"](),
    },
    {
      icon: WifiOff,
      title: m["landing.features.offline.title"](),
      description: m["landing.features.offline.description"](),
    },
    {
      icon: Scale,
      title: m["landing.features.open.title"](),
      description: m["landing.features.open.description"](),
    },
  ];

  return (
    <section id="features" className="px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-20">
          <h2 className="font-serif font-normal text-4xl sm:text-5xl tracking-tight">
            {m["landing.features.title"]()}
          </h2>
          <p className="mt-5 text-muted-foreground max-w-lg mx-auto">
            {m["landing.features.description"]()}
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ title, description, icon: Icon }) => (
            <div
              key={title}
              className="group relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 transition-all hover:border-foreground/20 hover:shadow-sm"
            >
              <div className="inline-flex size-10 items-center justify-center rounded-xl bg-muted text-foreground/80 transition-colors group-hover:bg-foreground group-hover:text-background">
                <Icon className="size-5" strokeWidth={1.75} />
              </div>
              <div className="space-y-2">
                <h3 className="font-medium">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

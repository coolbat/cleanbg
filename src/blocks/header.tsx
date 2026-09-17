import { SiteHeader } from "@/components/site-header";
import { m } from "@/paraglide/messages.js";

export function Header() {
  const navLinks = [
    { href: "/#features", label: m["landing.nav.features"]() },
    { href: "/#faq", label: m["landing.nav.faq"]() },
    { href: "/blog", label: m["landing.nav.blog"]() },
  ];

  return (
    <SiteHeader
      navLinks={navLinks}
      cta={{ href: "/#tool", label: m["landing.nav.cta"]() }}
    />
  );
}

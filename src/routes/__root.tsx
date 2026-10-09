/// <reference types="vite/client" />
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { Plausible } from '@/components/analytics/plausible';
import { PwaRegister } from '@/components/pwa-register';
import { Toaster } from '@/components/ui/sonner';
import { envConfigs } from '@/config';
import { getLocale } from '@/paraglide/runtime.js';

import '@fontsource-variable/inter';
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/700.css';
import '@fontsource/libre-baskerville/400-italic.css';
import '@/styles/globals.css';

export const Route = createRootRoute({
  head: () => {
    const appUrl = envConfigs.app_url || '';
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: envConfigs.app_name },
        { name: 'description', content: envConfigs.app_description },
        { name: 'theme-color', content: '#0a0a0a' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: envConfigs.app_name },
        { property: 'og:image', content: `${appUrl}/og.png` },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: `${appUrl}/og.png` },
      ],
      links: [
        { rel: 'icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    };
  },
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <Outlet />
      <Toaster position="top-center" richColors />
      <PwaRegister />
      {envConfigs.ga_id ? (
        <GoogleAnalytics measurementId={envConfigs.ga_id} />
      ) : null}
      {envConfigs.plausible_domain ? (
        <Plausible
          domain={envConfigs.plausible_domain}
          src={envConfigs.plausible_src || undefined}
        />
      ) : null}
    </ThemeProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <a href="/" className="text-sm underline underline-offset-4">
        Back to home
      </a>
    </div>
  );
}

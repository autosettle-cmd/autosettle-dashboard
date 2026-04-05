'use client';

import { getBrandCssVars } from '@/config/branding';

/** Injects brand CSS variables into :root so the entire app uses config/branding.ts colors */
export default function BrandingStyles() {
  const vars = getBrandCssVars();
  const css = `:root {\n${Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')}\n}`;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

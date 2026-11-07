import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/** KaTeX formula. Input is built by the app (user names are escaped in texFormat). */
export function Tex({ math, block = false, className }: { math: string; block?: boolean; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(math, { displayMode: block, throwOnError: false, trust: false, strict: 'ignore', output: 'html' }),
    [math, block],
  );
  return <span className={cn(block ? 'tex-block block overflow-x-auto overflow-y-hidden' : 'inline', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

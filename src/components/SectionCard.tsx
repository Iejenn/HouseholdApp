import type { CSSProperties, ReactNode } from 'react';

// Card with a coloured header strip — the look of the week menu's day cards,
// reused for task rooms, grocery lists and the cat shop
export default function SectionCard({
  title,
  color,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  color: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section-card${className ? ` ${className}` : ''}`} style={{ '--card-color': color } as CSSProperties}>
      <div className="section-card-head">
        <span className="section-card-title">{title}</span>
        {aside}
      </div>
      <div className="section-card-body">{children}</div>
    </section>
  );
}

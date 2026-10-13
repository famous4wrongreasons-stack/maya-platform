import { useLayoutEffect, useRef } from 'react';

export type CompanionSection = 'chat' | 'feed' | 'ideas' | 'tasks' | 'library';
type NavigationRef = HTMLElement | null;
const sections: readonly { key: CompanionSection; label: string }[] = [
  { key: 'chat', label: 'Чат' }, { key: 'feed', label: 'Лента' },
  { key: 'ideas', label: 'Идеи' }, { key: 'tasks', label: 'Задачи' },
  { key: 'library', label: 'Файлы' },
];

/** Gestures only: current selection and all workspace transitions belong to the runtime. */
export function CompanionNavigation({ current, choose }: {
  readonly current: CompanionSection; readonly choose: (section: CompanionSection) => void;
}) {
  const navigation = useRef<NavigationRef>(null);
  useLayoutEffect(() => {
    const element = navigation.current;
    if (!element) return;
    const measure = () => {
      const height = element.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--maya-navigation-space', `${height > 0 ? height + 8 : 0}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--maya-navigation-space'); };
  }, []);
  return <nav ref={navigation} className="companion-navigation" aria-label="Разделы Maya">
    {sections.map(section => <button key={section.key} type="button" aria-current={current === section.key ? 'page' : undefined}
      onClick={() => { if (current !== section.key) choose(section.key); }}>
      <span className={'companion-navigation-icon companion-navigation-' + section.key} aria-hidden="true" />
      <span className="companion-navigation-label">{section.label}</span>
    </button>)}
  </nav>;
}

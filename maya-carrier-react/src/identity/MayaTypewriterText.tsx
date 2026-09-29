// Ported from the canonical app.html:16599-16670, behaviour preserved exactly.
//
// The owner's reveal: 110 characters per second, rising to 170 when more than 160 characters are
// backlogged, driven by requestAnimationFrame with a character budget so the rate is wall-clock and
// not frame-rate. Under `prefers-reduced-motion: reduce` the whole string prints at once and the
// caret is not drawn — that branch is the canonical one, not an addition.
//
// The caret is a class, `maya-typewriter-caret`, exactly as in the source; its geometry lives in
// the stylesheet.

import { useEffect, useRef, useState } from 'react';

export function MayaTypewriterText({
  text,
  enabled = false,
  complete = true,
  onDone,
}: {
  readonly text: string;
  readonly enabled?: boolean;
  readonly complete?: boolean;
  readonly onDone?: () => void;
}) {
  const chars = Array.from(text ?? '');
  const initialCount = enabled && text ? 0 : chars.length;
  const [shown, setShown] = useState(initialCount);
  const shownRef = useRef(initialCount);
  const targetRef = useRef(chars);
  const completeRef = useRef(complete);
  const doneRef = useRef(onDone);
  targetRef.current = chars;
  completeRef.current = complete;
  doneRef.current = onDone;

  const live = !!(enabled && text);

  useEffect(() => {
    let reduced = false;
    try {
      reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      reduced = false;
    }
    let finished = false;
    let frame = 0;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      shownRef.current = targetRef.current.length;
      setShown(shownRef.current);
      doneRef.current?.();
    };
    if (!live) {
      finish();
      return;
    }
    shownRef.current = 0;
    setShown(0);
    let lastFrame = 0;
    let charBudget = 0;
    const tick = (now: number): void => {
      const targetLength = targetRef.current.length;
      let current = shownRef.current;
      if (reduced) current = targetLength;
      else if (current < targetLength) {
        if (!lastFrame) lastFrame = now - 16;
        const elapsed = Math.max(0, Math.min(48, now - lastFrame));
        const backlog = targetLength - current;
        const charsPerSecond = backlog > 160 ? 170 : 110;
        charBudget += (elapsed * charsPerSecond) / 1000;
        let step = Math.floor(charBudget);
        if (current === 0 && step < 1) step = 1;
        if (step > 0) {
          charBudget = Math.max(0, charBudget - step);
          current = Math.min(targetLength, current + step);
        }
      } else if (current > targetLength) current = targetLength;
      lastFrame = now;
      if (current !== shownRef.current) {
        shownRef.current = current;
        setShown(current);
      }
      if (completeRef.current && current >= targetLength) finish();
      else frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [live]);

  const active = live && (shown < chars.length || !complete);
  return (
    <>
      {chars.slice(0, shown).join('')}
      {active ? <span className="maya-typewriter-caret" aria-hidden="true" /> : null}
    </>
  );
}

// The detail host's adapter: the shell's view in, its close out. Nothing else.

import type { InteractiveRefKey } from '../../../maya-chat-shell/src/contract.ts';
import { widgets } from '../runtime/compose.ts';
import { usePortView } from '../runtime/useView.ts';
import type { Tokens } from '../identity/tokens.ts';
import { DetailSheet } from './DetailSheet.tsx';

export function FullscreenDetail({
  t,
  focusFallback,
}: {
  readonly t: Tokens;
  readonly focusFallback: () => void;
}) {
  const shell = usePortView(widgets);
  return (
    <DetailSheet
      view={shell.fullscreen}
      t={t}
      activate={(itemId: string, ref: InteractiveRefKey) => widgets.activate(itemId, ref)}
      rendered={widgets.rendered}
      close={() => widgets.closeDetail()}
      focusFallback={focusFallback}
    />
  );
}

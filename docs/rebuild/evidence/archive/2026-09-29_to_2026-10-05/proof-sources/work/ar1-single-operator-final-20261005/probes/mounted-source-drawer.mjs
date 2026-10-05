// The canonical DOM drawer drives render observations after mount, independently of activation.
// Its DOM/scheduler are test doubles; React's actual browser mount is separately proved by L25.
import { createWidgetDrawer } from '/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/maya-controlled-integration/maya-chat-shell/src/dom/host.ts';
import { createDom, createScheduler } from '/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/maya-controlled-integration/maya-chat-shell/test/dom-double.mjs';
export function mountRuntimeDrawer(runtime) {
  const dom = createDom(), scheduler = createScheduler(Date.now());
  const drawer = createWidgetDrawer({ factory: dom.factory, scheduler, widgets: runtime.widgetPort });
  const draw = () => {
    for (const item of runtime.conversation.view().items) if (item.kind === 'widget') {
      const article = drawer.element(item);
      if (!article.isConnected) dom.root.append(article);
    }
    scheduler.flush();
  };
  const off = runtime.conversation.subscribe(draw);
  draw();
  return off;
}

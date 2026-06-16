export {};

declare global {
  interface Window {
    __ROUTER_BASENAME__?: string;
    pixcodeDesktop?: {
      notify: (payload: {
        title: string;
        body?: string;
        event?: string;
        tag?: string;
        data?: Record<string, unknown>;
      }) => Promise<boolean>;
    };
    refreshProjects?: () => void | Promise<void>;
    openSettings?: (tab?: string) => void;
    openQuickSettings?: () => void;
    toggleQuickSettings?: () => void;
  }

  interface EventSourceEventMap {
    result: MessageEvent;
    progress: MessageEvent;
    done: MessageEvent;
  }
}

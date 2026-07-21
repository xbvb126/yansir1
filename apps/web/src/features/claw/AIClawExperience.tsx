import type { FormEvent, ReactNode } from "react";
import { AI_CLAW_QUICK_ACTIONS, type AIClawQuickActionId } from "./aiClawPrompts";

export type AIClawExperienceProps = {
  status: ReactNode;
  signedIn: boolean;
  insightCopy: ReactNode;
  messages: ReactNode;
  signalContext?: ReactNode;
  input: string;
  loading: boolean;
  onQuickAction: (actionId: AIClawQuickActionId) => void;
  onInput: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLogin: () => void;
  onHelp: () => void;
  onClearContext: () => void;
  renderIcon: (name: string) => ReactNode;
};

export function AIClawExperience({
  status,
  signedIn,
  insightCopy,
  messages,
  signalContext,
  input,
  loading,
  onQuickAction,
  onInput,
  onSubmit,
  onLogin,
  onHelp,
  onClearContext,
  renderIcon,
}: AIClawExperienceProps) {
  return (
    <section className="ai-claw-workspace">
      <header className="ai-claw-workspace__header">
        <div>
          <h1>AIClaw</h1>
          <span className="ai-claw-workspace__status">{status}</span>
        </div>
        <button type="button" onClick={onHelp} aria-label="AIClaw 帮助">
          {renderIcon("message")}
          <span>帮助</span>
        </button>
      </header>

      <section className="ai-claw-overview">
        <h2>今天想先看什么？</h2>
        <p>{insightCopy}</p>
      </section>

      <div className="ai-claw-quick-actions" aria-label="AIClaw 快捷提问">
        {AI_CLAW_QUICK_ACTIONS.map((action) => (
          <button
            type="button"
            key={action.id}
            disabled={!signedIn}
            onClick={() => onQuickAction(action.id)}
          >
            {renderIcon(action.icon)}
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      <section className="ai-claw-conversation" aria-live="polite">
        {!signedIn && (
          <div className="ai-claw-login-gate">
            <strong>登录后使用 AIClaw</strong>
            <p>登录后可结合你的市场行情、策略信号和告警上下文进行分析。</p>
            <button type="button" onClick={onLogin}>去登录</button>
          </div>
        )}
        {messages}
      </section>

      {signalContext && (
        <section className="ai-claw-signal-context" aria-label="信号上下文">
          <header>
            <h2>信号上下文</h2>
            <button type="button" onClick={onClearContext}>清除上下文</button>
          </header>
          {signalContext}
        </section>
      )}

      <form className="ai-claw-composer" onSubmit={onSubmit}>
        <label>
          <span>向 AIClaw 提问</span>
          <textarea
            value={input}
            disabled={!signedIn}
            onChange={(event) => onInput(event.target.value)}
            rows={2}
          />
        </label>
        <button type="submit" disabled={!signedIn || loading}>
          {renderIcon("send")}
          {loading ? "分析中" : "发送"}
        </button>
      </form>
    </section>
  );
}

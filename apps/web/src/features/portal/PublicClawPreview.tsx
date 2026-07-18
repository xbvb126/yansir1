import { SystemIcon } from "../../components/SystemIcon";

export function PublicClawPreview({ onLogin }: { onLogin: () => void }) {
  return (
    <section className="view active-view public-claw-preview" aria-labelledby="public-claw-title">
      <section className="public-claw-hero">
        <span className="icon-tile blue"><SystemIcon name="network" /></span>
        <div>
          <span className="portal-eyebrow">AI Claw 能力预览</span>
          <h1 id="public-claw-title">先看懂信号，再决定是否跟踪</h1>
          <p>AI Claw 围绕策略引擎已经生成的信号解释触发证据、机会与风险；它不会创建或覆盖策略方向。</p>
        </div>
      </section>

      <section className="public-claw-card" aria-labelledby="claw-context-title">
        <div className="portal-section__heading">
          <span>如何工作</span>
          <h2 id="claw-context-title">使用真实信号上下文进行复核</h2>
        </div>
        <ol className="public-claw-flow">
          <li><span>1</span><p>读取币种、方向、策略分和触发证据。</p></li>
          <li><span>2</span><p>解释信号成立的原因与需要留意的风险。</p></li>
          <li><span>3</span><p>保留策略结论，帮助你继续查看行情或设置告警。</p></li>
        </ol>
      </section>

      <section className="public-claw-card" aria-labelledby="claw-examples-title">
        <div className="portal-section__heading">
          <span>示例问题</span>
          <h2 id="claw-examples-title">登录后可以这样问</h2>
        </div>
        <ul className="public-claw-examples">
          <li>为什么这条 BTC 策略信号会在此时触发？</li>
          <li>这条信号最重要的失效条件是什么？</li>
          <li>结合当前信号上下文，接下来应该关注哪些风险？</li>
        </ul>
      </section>

      <section className="public-claw-login">
        <div><strong>登录后使用 AI Claw</strong><p>登录后才会发送你的问题，并按当前套餐使用可用额度。</p></div>
        <button className="portal-primary-action" type="button" onClick={onLogin}>登录并继续</button>
      </section>
    </section>
  );
}

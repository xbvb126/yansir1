import type { ViewName } from "../../components/BottomNav";
import { SystemIcon } from "../../components/SystemIcon";
import type { PublicSignal } from "./publicPortalApi";

export function PublicHomeView({ featuredSignal, onNavigate }: { featuredSignal: PublicSignal | null; onNavigate: (view: ViewName) => void }) {
  const lockedFields = featuredSignal?.performance?.access?.lockedFields || [];
  const return15m = lockedFields.includes("15m") ? "会员解锁" : featuredSignal?.performance?.returns["15m"];
  const return1h = lockedFields.includes("1h") ? "会员解锁" : featuredSignal?.performance?.returns["1h"];

  return (
    <section className="view active-view public-home-view">
      <section className="portal-hero" aria-labelledby="public-home-title">
        <div className="portal-hero__copy">
          <span className="portal-eyebrow">Yansir 公共产品门户</span>
          <h1 id="public-home-title">实时扫描市场，输出可解释的策略信号</h1>
          <p>策略引擎负责生成信号，AI Claw 只解释和复核，不创建或覆盖交易方向。</p>
          <div className="portal-hero__actions">
            <button className="portal-primary-action" type="button" onClick={() => onNavigate("radar")}>体验公开雷达</button>
            <button className="portal-secondary-action" type="button" onClick={() => onNavigate("track-record")}>查看历史战绩</button>
          </div>
        </div>
        <aside className="portal-reassurance" aria-label="公开体验说明">
          <strong>先验证，再决定</strong>
          <ul>
            <li><SystemIcon name="check" />无需登录即可浏览</li>
            <li><SystemIcon name="clock" />真实信号延迟 8 小时</li>
            <li><SystemIcon name="shield" />仅供研究参考，不构成投资建议</li>
          </ul>
        </aside>
      </section>

      <section className="portal-section" aria-labelledby="portal-questions-title">
        <div className="portal-section__heading">
          <span>从问题出发</span>
          <h2 id="portal-questions-title">每条信号都回答三个问题</h2>
        </div>
        <div className="portal-question-grid">
          <article><span>01</span><h3>现在发生了什么？</h3><p>用市场异动与策略雷达识别值得关注的变化。</p></article>
          <article><span>02</span><h3>为什么触发？</h3><p>查看策略证据，再由 AI Claw 解释与复核。</p></article>
          <article><span>03</span><h3>后来表现怎样？</h3><p>通过固定窗口战绩回看信号，而不是只展示结论。</p></article>
        </div>
      </section>

      <section className="portal-section" aria-labelledby="portal-signal-title">
        <div className="portal-section__heading">
          <span>可验证的真实记录</span>
          <h2 id="portal-signal-title">公开信号示例</h2>
        </div>
        {featuredSignal ? (
          <article className="portal-signal-card">
            <div className="portal-signal-card__head">
              <div><strong>{featuredSignal.symbol}</strong><span>{featuredSignal.direction === "long" ? "做多" : "做空"}</span></div>
              <em>策略分 {featuredSignal.score}</em>
            </div>
            <p>{featuredSignal.reason}</p>
            <dl>
              <div><dt>生成时间</dt><dd>{featuredSignal.time}</dd></div>
              <div><dt>15 分钟复盘</dt><dd>{typeof return15m === "number" ? `${(return15m * 100).toFixed(2)}%` : return15m || "计算中"}</dd></div>
              <div><dt>1 小时复盘</dt><dd>{typeof return1h === "number" ? `${(return1h * 100).toFixed(2)}%` : return1h || "计算中"}</dd></div>
              <div><dt>策略来源</dt><dd>{featuredSignal.engine || "策略引擎"}</dd></div>
            </dl>
          </article>
        ) : (
          <div className="portal-empty-state" role="status">
            <SystemIcon name="clock" />
            <div><strong>暂无可展示的延迟信号</strong><p>公开记录只展示服务端确认已满足 8 小时延迟条件的真实信号。</p></div>
          </div>
        )}
      </section>

      <section className="portal-section" aria-labelledby="portal-flow-title">
        <div className="portal-section__heading">
          <span>清晰的职责边界</span>
          <h2 id="portal-flow-title">从策略信号到复盘记录</h2>
        </div>
        <ol className="portal-flow">
          <li><span>1</span><div><strong>策略引擎生成信号</strong><p>市场数据与确定性规则决定方向、分数和触发证据。</p></div></li>
          <li><span>2</span><div><strong>AI Claw 解释与复核</strong><p>围绕已经存储的信号上下文解释机会与风险，不替代策略。</p></div></li>
          <li><span>3</span><div><strong>告警并记录结果</strong><p>按权益通知用户，并在固定窗口记录后续表现。</p></div></li>
        </ol>
      </section>

      <section className="portal-section" aria-labelledby="portal-plans-title">
        <div className="portal-section__heading">
          <span>按需使用</span>
          <h2 id="portal-plans-title">Free / VIP / SVIP</h2>
        </div>
        <div className="portal-plan-grid">
          <article><strong>Free</strong><p>浏览公开市场、8 小时延迟雷达与 7 天战绩。</p></article>
          <article><strong>VIP</strong><p>获得计划定义的实时能力、更多告警与复核额度。</p></article>
          <article><strong>SVIP</strong><p>获得更高额度、API 与团队协作等计划权益。</p></article>
        </div>
        <button className="portal-plan-link" type="button" onClick={() => onNavigate("plans")}>比较完整套餐权益</button>
      </section>

      <section className="portal-final-cta" aria-labelledby="portal-final-title">
        <div><span>无需登录</span><h2 id="portal-final-title">先用真实延迟信号验证 Yansir</h2><p>公开雷达与历史战绩都来自可追溯的策略记录。</p></div>
        <div>
          <button className="portal-primary-action" type="button" onClick={() => onNavigate("radar")}>进入公开雷达</button>
          <button className="portal-secondary-action" type="button" onClick={() => onNavigate("login")}>登录 / 注册</button>
        </div>
      </section>
    </section>
  );
}

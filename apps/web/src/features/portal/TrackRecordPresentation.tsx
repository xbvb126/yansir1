import type { FormEvent } from "react";
import { SystemIcon } from "../../components/SystemIcon";
import { publicReturnTone, toTrustSummaryView, type TrackRecordRow } from "./publicPerformance";
import type { PublicPerformanceSummary } from "./publicPortalApi";

export function TrackRecordHero({ delayHours, historyDays }: { delayHours: number | null; historyDays: number | null }) {
  return (
    <header className="track-record-heading">
      <div>
        <span className="portal-eyebrow">可验证的公开记录</span>
        <h1 id="track-record-title">历史战绩</h1>
        <p>基于公开信号的真实执行记录，数据可验证。</p>
      </div>
      <span className="track-record-verified" aria-label="公开数据范围">
        <SystemIcon name="shield" />
        {delayHours === null || historyDays === null ? "公开范围读取中" : `${historyDays} 天记录 · 延迟 ${delayHours} 小时`}
      </span>
    </header>
  );
}

export function TrustSummary({ summary }: { summary: PublicPerformanceSummary }) {
  const view = toTrustSummaryView(summary);
  return (
    <section className={`track-trust-summary ${view.isEmpty ? "is-empty" : ""}`} aria-labelledby="track-trust-title">
      <h2 id="track-trust-title">可信度总览</h2>
      <div className="track-trust-grid">
        <article className="track-trust-primary">
          <span>1h 方向命中率</span>
          <strong>{view.hitRate}</strong>
          <small>{view.sampleCaption} · {view.sampleCount}</small>
        </article>
        <article>
          <span aria-label="公开信号样本"><SystemIcon name="database" />公开信号</span>
          <strong>{view.sampleCount}<small> 条</small></strong>
        </article>
        <article>
          <span><SystemIcon name="target" />平均方向收益</span>
          <strong className={publicReturnTone(view.averageReturn)}>{view.averageReturn}</strong>
        </article>
      </div>
    </section>
  );
}

type FilterProps = {
  symbolDraft: string;
  direction: "all" | "long" | "short";
  onSymbolDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onDirectionChange: (direction: "all" | "long" | "short") => void;
};

export function TrackRecordFilters(props: FilterProps) {
  return (
    <section className="track-record-controls" aria-label="战绩筛选">
      <form onSubmit={props.onSubmit}>
        <label><span>币种</span><input value={props.symbolDraft} onChange={(event) => props.onSymbolDraftChange(event.target.value)} placeholder="BTC / ETH / SOL" /></label>
        <button type="submit">筛选</button>
      </form>
      <div role="group" aria-label="方向筛选">
        {(["all", "long", "short"] as const).map((item) => (
          <button className={props.direction === item ? "active" : ""} key={item} type="button" onClick={() => props.onDirectionChange(item)}>
            {item === "all" ? "全部方向" : item === "long" ? "看多" : "看空"}
          </button>
        ))}
      </div>
    </section>
  );
}

export function TrackRecordList({ rows, hasMore, loadingMore, onLoadMore }: { rows: TrackRecordRow[]; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void }) {
  return (
    <section className="track-record-ledger" aria-labelledby="track-ledger-title">
      <div className="track-record-ledger-head"><h2 id="track-ledger-title">最近公开信号</h2><span>固定窗口复盘</span></div>
      <div className="track-record-list">
        {rows.map((row) => (
          <article className="track-record-row" key={row.id}>
            <div><strong>{row.symbol}</strong><small>{new Date(row.time).toLocaleString("zh-CN", { hour12: false })}</small></div>
            <div><span className={`track-direction ${row.direction}`}>{row.direction === "long" ? "看多" : "看空"}</span><small>{row.score} 分</small></div>
            <div><span className={`track-completion ${row.completionStatus}`}>{row.completionStatus === "completed" ? "已完成" : "待完成"}</span><strong className={publicReturnTone(row.return1h)}>{row.return1h}</strong><small>1h</small></div>
          </article>
        ))}
      </div>
      {hasMore && <button className="portal-retry-button" type="button" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "加载中…" : "加载更多"}</button>}
    </section>
  );
}

export function MethodologyDisclosure() {
  return (
    <details className="track-methodology-disclosure">
      <summary><SystemIcon name="target" /><span><strong>固定窗口，不挑样本</strong><small>查看统计口径与公开字段范围</small></span></summary>
      <div>
        <p>每条信号按 15m、1h、4h、24h 到期时间统一复盘。</p>
        <p>匿名用户仅查看 15m / 1h；4h、24h、MFE、MAE 为会员字段。</p>
        <p>延迟和历史范围由 API 返回，不使用客户端计时替代服务端约束。</p>
      </div>
    </details>
  );
}

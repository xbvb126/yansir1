export type RadarSource = "ai" | "strategy" | "mine";

export type RadarCategoryItem = {
  id: string;
  label: string;
  count?: number;
};

export type RadarWorkspaceChromeProps = {
  activeSource: RadarSource;
  onSourceChange: (source: RadarSource) => void;
  listenerLabel: string;
  latestPrefix?: string;
  latestScanLabel: string;
  categoryItems: RadarCategoryItem[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
  onOpenFilters: () => void;
};

const SOURCE_TABS: Array<{ id: RadarSource; label: string }> = [
  { id: "ai", label: "市场异动" },
  { id: "strategy", label: "策略信号" },
  { id: "mine", label: "我的" },
];

export function RadarWorkspaceChrome({
  activeSource,
  onSourceChange,
  listenerLabel,
  latestPrefix = "最后扫描",
  latestScanLabel,
  categoryItems,
  activeCategory,
  onCategoryChange,
  onOpenFilters,
}: RadarWorkspaceChromeProps): JSX.Element {
  return (
    <header className="ai-track-header radar-workspace-chrome">
      <div className="ai-track-topline radar-workspace-chrome__heading">
        <h1>雷达</h1>
        <div className="radar-workspace-chrome__status" aria-live="polite">
          <strong>{listenerLabel}</strong>
          <span>{latestPrefix} {latestScanLabel}</span>
        </div>
      </div>

      <div className="ai-track-tabs radar-workspace-chrome__sources" role="tablist" aria-label="信号来源">
        {SOURCE_TABS.map((source) => (
          <button
            className={activeSource === source.id ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={activeSource === source.id}
            tabIndex={activeSource === source.id ? 0 : -1}
            key={source.id}
            onClick={() => onSourceChange(source.id)}
          >
            {source.label}
          </button>
        ))}
      </div>

      <div className="ai-track-tabs radar-workspace-chrome__categories" role="group" aria-label="雷达分类">
        {categoryItems.map((item) => (
          <button
            className={activeCategory === item.id ? "active" : ""}
            type="button"
            aria-pressed={activeCategory === item.id}
            key={item.id}
            onClick={() => onCategoryChange(item.id)}
          >
            {item.label}
            {item.count === undefined ? null : <span>{item.count}</span>}
          </button>
        ))}
        <button type="button" aria-label="高级筛选" onClick={onOpenFilters}>高级筛选</button>
      </div>
    </header>
  );
}

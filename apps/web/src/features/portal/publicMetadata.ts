import type { ViewName } from "../../components/BottomNav";

type PublicMetadata = { title: string; description: string };

const PUBLIC_METADATA: Partial<Record<ViewName, PublicMetadata>> = {
  home: {
    title: "Yansir | 可解释的加密策略信号",
    description: "实时扫描市场，由策略引擎生成信号，AI Claw 负责解释与复核。"
  },
  data: {
    title: "市场数据 | Yansir",
    description: "浏览公开加密市场概览与币种数据。"
  },
  radar: {
    title: "延迟策略雷达 | Yansir",
    description: "查看延迟八小时的真实 Yansir 策略信号。"
  },
  "track-record": {
    title: "历史战绩 | Yansir",
    description: "按固定窗口查看完整公开信号样本与计算方法。"
  },
  plans: {
    title: "套餐 | Yansir",
    description: "比较 Free、VIP 和 SVIP 的延迟、战绩、告警、API 与团队权益。"
  }
};

function ensureMeta(property: string) {
  const attribute = property.startsWith("og:") ? "property" : "name";
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${property}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, property);
    document.head.appendChild(element);
  }
  return element;
}

function ensureCanonical() {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  return element;
}

function canonicalPublicUrl(view: ViewName, location: Pick<Location, "href">) {
  const url = new URL(location.href);
  url.hash = "";
  url.search = view === "home" ? "" : `?view=${encodeURIComponent(view)}`;
  return url.toString();
}

export function syncPublicMetadata(view: ViewName, location: Pick<Location, "href">) {
  const metadata = PUBLIC_METADATA[view];
  if (!metadata) {
    document.title = "Yansir";
    ensureMeta("robots").content = "noindex,nofollow";
    ensureMeta("description").content = "Yansir 会员功能";
    ensureMeta("og:title").content = "Yansir";
    ensureMeta("og:description").content = "Yansir 会员功能";
    ensureMeta("og:url").content = "";
    ensureCanonical().href = "";
    return;
  }

  const canonical = canonicalPublicUrl(view, location);
  document.documentElement.lang = "zh-CN";
  ensureMeta("robots").content = "index,follow";
  document.title = metadata.title;
  ensureMeta("description").content = metadata.description;
  ensureMeta("og:title").content = metadata.title;
  ensureMeta("og:description").content = metadata.description;
  ensureMeta("og:url").content = canonical;
  ensureCanonical().href = canonical;
}

import { Injectable } from "@nestjs/common";
import { MarketService } from "../market/market.service";
import { MarketTicker } from "../market/market.types";
import { SignalsService } from "../signals/signals.service";

type ClawBlock = {
  type: string;
  title: string;
  time?: string;
  items?: string[];
};

type ClawMode = "llm" | "template";

type ClawResponse = {
  intent: string;
  userId?: string;
  message: string;
  blocks: ClawBlock[];
  mode: ClawMode;
  provider: string;
  model?: string;
  llmConfigured: boolean;
  fallbackReason?: string;
  context: {
    target: string;
    market?: MarketTicker;
    overview?: Array<{
      symbol: string;
      price: string;
      change: string;
      score: number;
      state: string;
      source?: string;
    }>;
    signals: Array<{
      symbol: string;
      score: number;
      direction: string;
      title: string;
      reason: string;
    }>;
  };
};

type LlmChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

@Injectable()
export class ClawService {
  constructor(
    private readonly marketService: MarketService,
    private readonly signalsService: SignalsService
  ) {}

  status() {
    return {
      llmConfigured: Boolean(this.getApiKey()),
      provider: this.getApiKey() ? "openai-compatible" : "local-rules",
      model: this.getModel(),
      source: this.getApiKey() ? this.getBaseUrl() : "实时行情 + 本地规则"
    };
  }

  async chat(message: string, userId?: string): Promise<ClawResponse> {
    const normalizedMessage = message.trim() || "今天有哪些币可以关注";
    const intent = this.detectIntent(normalizedMessage);
    const symbol = this.extractSymbol(normalizedMessage);
    const target = symbol || "当前市场";
    const context = await this.buildContext(symbol);
    const template = this.buildTemplateResponse({
      normalizedMessage,
      intent,
      symbol,
      target,
      userId,
      context
    });

    if (!this.getApiKey()) {
      return {
        ...template,
        fallbackReason: "LLM API Key 未配置，当前使用系统规则分析。"
      };
    }

    try {
      const blocks = await this.generateLlmBlocks(normalizedMessage, intent, target, context);
      return {
        ...template,
        blocks,
        mode: "llm",
        provider: "openai-compatible",
        model: this.getModel(),
        fallbackReason: undefined
      };
    } catch (error) {
      return {
        ...template,
        fallbackReason: error instanceof Error ? `LLM 调用失败，已回退规则分析：${error.message}` : "LLM 调用失败，已回退规则分析。"
      };
    }
  }

  private buildTemplateResponse({
    normalizedMessage,
    intent,
    symbol,
    target,
    userId,
    context
  }: {
    normalizedMessage: string;
    intent: string;
    symbol?: string;
    target: string;
    userId?: string;
    context: ClawResponse["context"];
  }): ClawResponse {
    const liveSummary = context.market
      ? `${context.market.symbol.replace(/USDT$/, "")} 当前价格 ${context.market.price}，24H ${context.market.change}，成交额 ${context.market.quoteVolume}，数据源 ${context.market.source ?? "unknown"}。`
      : context.overview?.length
        ? `当前市场前列：${context.overview.map((row) => `${row.symbol} ${row.change}`).join("、")}。`
        : "当前行情上下文暂未返回，先使用页面信号和规则框架分析。";
    const signalSummary = context.signals.length
      ? `最新信号：${context.signals
          .slice(0, 3)
          .map((signal) => `${signal.symbol} ${signal.score}分 ${signal.title}`)
          .join("；")}。`
      : "暂无可用信号事件。";

    return {
      intent,
      userId,
      message: normalizedMessage,
      blocks: [
        {
          type: "summary",
          title: `ValueClaw 正在分析 ${target} 的机会`,
          time: new Date().toISOString(),
          items: [liveSummary, signalSummary]
        },
        {
          type: "group",
          title: symbol ? `${symbol} 机会观察` : "机会观察",
          items: this.opportunityItems(symbol, intent, context)
        },
        {
          type: "risk",
          title: "风险提示",
          items: this.riskItems(symbol, context)
        },
        {
          type: "action",
          title: "建议下一步",
          items: [
            symbol
              ? `进入 ${symbol} 详情页确认实时价格、最近 K 线和策略扫描触发证据。`
              : "先从数据页选择一个波动和成交额都靠前的币种，再让 ValueClaw 做单币解释。",
            "如果信号分数超过阈值，可生成告警文案并设置飞书推送。"
          ]
        }
      ],
      mode: "template",
      provider: "local-rules",
      model: this.getModel(),
      llmConfigured: Boolean(this.getApiKey()),
      context
    };
  }

  private async buildContext(symbol?: string): Promise<ClawResponse["context"]> {
    const target = symbol || "当前市场";
    const signalsPromise = this.signalsService
      .listSignals()
      .then(({ signals }) =>
        signals
          .filter((signal) => !symbol || signal.symbol.toUpperCase() === symbol)
          .slice(0, 5)
          .map((signal) => ({
            symbol: signal.symbol,
            score: signal.score,
            direction: signal.direction,
            title: signal.title,
            reason: signal.reason
          }))
      )
      .catch(() => []);

    if (symbol) {
      const [signals, market] = await Promise.all([
        signalsPromise,
        withTimeout<MarketTicker | undefined>(this.marketService.getTicker(symbol), 12000, undefined)
      ]);

      return {
        target,
        market,
        signals
      };
    }

    const overviewPromise = this.marketService.getOverview().then((overview) =>
      overview.rows.slice(0, 7).map((row) => ({
        symbol: row.symbol,
        price: row.price,
        change: row.change,
        score: row.score,
        state: row.state,
        source: row.source
      }))
    );
    const [signals, overview] = await Promise.all([
      signalsPromise,
      withTimeout<ClawResponse["context"]["overview"]>(overviewPromise, 12000, undefined)
    ]);

    return {
      target,
      overview,
      signals
    };
  }

  private async generateLlmBlocks(
    normalizedMessage: string,
    intent: string,
    target: string,
    context: ClawResponse["context"]
  ): Promise<ClawBlock[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.LLM_TIMEOUT_MS || 15000));

    try {
      const response = await fetch(`${this.getBaseUrl().replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.getApiKey()}`
        },
        body: JSON.stringify({
          model: this.getModel(),
          temperature: 0.35,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "你是 ValueClaw，一个面向加密货币机会和风险的聊天式 Agent。只能基于用户问题和系统提供的行情、信号上下文分析，不要杜撰未给出的价格、指标或扫描结果。返回严格 JSON，格式为 {\"blocks\":[{\"type\":\"summary|group|risk|action\",\"title\":\"标题\",\"items\":[\"要点\"]}]}。每个 block 1 到 3 条 items，中文，简洁，不能包含 Markdown。"
            },
            {
              role: "user",
              content: JSON.stringify({
                userQuestion: normalizedMessage,
                intent,
                target,
                systemContext: context,
                requirements: [
                  "说明机会条件、风险点和下一步动作",
                  "如果数据不足，要明确说明需要等待下一次扫描或进入详情页确认",
                  "不得给出确定性收益承诺，不构成投资建议"
                ]
              })
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as LlmChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("empty response");
      }

      const parsed = JSON.parse(content) as { blocks?: unknown };
      return this.normalizeBlocks(parsed.blocks);
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeBlocks(blocks: unknown): ClawBlock[] {
    if (!Array.isArray(blocks)) {
      throw new Error("invalid block shape");
    }

    const normalized = blocks.slice(0, 5).reduce<ClawBlock[]>((result, block) => {
        if (!block || typeof block !== "object") {
          return result;
        }

        const value = block as Record<string, unknown>;
        const title = typeof value.title === "string" ? value.title.trim() : "";
        const type = typeof value.type === "string" ? value.type.trim() : "group";
        const items = Array.isArray(value.items)
          ? value.items.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 4)
          : [];

        if (!title || !items.length) {
          return result;
        }

        result.push({ type, title, items });
        return result;
      }, []);

    if (!normalized.length) {
      throw new Error("no usable blocks");
    }

    return normalized;
  }

  private detectIntent(message: string) {
    const upperMessage = message.toUpperCase();
    if (message.includes("回测")) return "backtest_request";
    if (message.includes("每天") || message.includes("定时")) return "scheduled_task";
    if (message.includes("最新") || upperMessage.includes("BTC") || upperMessage.includes("ETH")) return "market_snapshot";
    if (message.includes("为什么") || message.includes("解释")) return "signal_explanation";
    return "coin_recommendation";
  }

  private extractSymbol(message: string) {
    const match = message
      .toUpperCase()
      .match(/\b(BTC|ETH|SOL|XRP|BCH|BNB|DOGE|USDT|ADA|LINK|AVAX|TON|TRX|OP|ARB|SUI|UNI|PEPE)(?:USDT)?\b/);
    return match?.[1];
  }

  private opportunityItems(symbol: string | undefined, intent: string, context: ClawResponse["context"]) {
    if (!symbol) {
      const leaders = context.overview?.slice(0, 3).map((row) => `${row.symbol} ${row.change}`) ?? [];
      return [
        leaders.length ? `优先观察：${leaders.join("、")}，再结合成交额和策略信号确认。` : "优先关注：24H 成交额放大、价格趋势转强、策略扫描出现信号的币种。",
        "机会确认：需要同时观察短周期 K 线、成交量、资金流和异常评分。",
        "执行方式：先加入自选，再设置分数阈值和推送渠道，避免只凭单一涨幅追入。"
      ];
    }

    if (intent === "signal_explanation") {
      return [
        `${symbol} 的解释重点应放在触发信号的引擎、方向、价格位置和分数影响。`,
        "如果策略状态为趋势候选但信号数为 0，说明当前更适合观察，不是强入场信号。",
        "若后续成交额继续放大且异常评分抬升，可以把它升级为重点跟踪。"
      ];
    }

    const marketLine = context.market
      ? `${symbol} 当前 ${context.market.change}，成交额 ${context.market.quoteVolume}，需要确认趋势和资金流是否共振。`
      : `${symbol} 当前行情暂未返回，需要等待详情页同步。`;

    return [
      marketLine,
      "如果当前扫描未触发强信号，适合放入观察列表，等待下一轮确认。",
      "如果评分升至 65 以上，再结合风险提示生成告警或推送给团队。"
    ];
  }

  private riskItems(symbol: string | undefined, context: ClawResponse["context"]) {
    const relatedSignal = symbol ? context.signals.find((signal) => signal.symbol.toUpperCase() === symbol) : context.signals[0];
    return [
      relatedSignal
        ? `${relatedSignal.symbol} 当前信号分 ${relatedSignal.score}，仍要核对价格位置和成交量延续性。`
        : `${symbol || "目标币种"} 如果只有价格上涨但成交额、资金流和策略信号没有共振，容易是假突破。`,
      "以上分析用于辅助决策，不构成投资建议；高波动行情需要设置止损和仓位上限。"
    ];
  }

  private getApiKey() {
    return process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || "";
  }

  private getBaseUrl() {
    return process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  }

  private getModel() {
    return process.env.OPENAI_MODEL || process.env.LLM_MODEL || "gpt-4o-mini";
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

#!/usr/bin/env python3
"""
touzi.py — 分档加杠杆反弹策略模拟器

策略：
  股票从 P=1.00 下跌，每跌到触发价卖出 normal 持仓的一部分，
  用所得现金建立 2x 杠杆头寸。最终反弹回 P=1.00，计算累计盈亏。

支持 2 种杠杆模型：
  - borrow_2x     : 借款加倍建仓（NAV=1 per share, debt 同时增长）
  - leverage_etf  : 杠杆 ETF (NAV = 2P - 1; P<0.5 归零)

用法:
  python touzi.py                 # 跑默认 6 档问题
  python touzi.py --model both    # 跑两个模型对比
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from typing import Literal


# 用户原题档位
DEFAULT_TRIGGERS: list[tuple[float, float]] = [
    (0.80, 0.08),
    (0.70, 0.12),
    (0.60, 0.20),
    (0.50, 0.28),
    (0.45, 0.20),
    (0.40, 0.12),
]

INITIAL_VALUE = 1_000_000.0   # 100 万初始市值
INITIAL_SHARES = INITIAL_VALUE / 1.0  # = 1,000,000 股 @ P=1.0


# 方案1: 纯现金加仓 触发参数 = (drop_pct, cash_wan_万元)
CASH_TRIGGERS: list[tuple[float, float]] = [
    (0.80, 8.0),
    (0.70, 12.0),
    (0.60, 20.0),
    (0.50, 28.0),
    (0.55, 20.0),
    (0.60, 12.0),
]


class ZeroNavError(ArithmeticError):
    """杠杆 ETF NAV 跌到 ≤0（数学上归零或不存在）。"""


class InsufficientShares(ValueError):
    """卖出比例超过当前 normal 持仓。"""


@dataclass
class Portfolio:
    normal_shares: float = INITIAL_SHARES
    leverage_units: float = 0.0    # borrow_2x: 加倍股数；leverage_etf: ETF 份数
    debt: float = 0.0              # 仅 borrow_2x 使用
    cash: float = 0.0              # 现金缓冲（如有）

    def value(self, price: float, model: str) -> float:
        """在给定价格 P 下的组合现值。"""
        normal_val = self.normal_shares * price
        if model == "borrow_2x":
            # leverage_units 是 normal 股，账面与 normal_shares 合并计价
            leverage_val = self.leverage_units * price
            return normal_val + leverage_val - self.debt
        elif model == "leverage_etf":
            nav = 2.0 * price - 1.0
            if nav < 0:
                raise ZeroNavError(f"NAV({price})={nav} < 0")
            leverage_val = self.leverage_units * nav
            return normal_val + leverage_val + self.cash
        else:
            raise ValueError(f"unknown model: {model}")


def execute_trigger(
    portfolio: Portfolio,
    price: float,
    sell_pct: float,
    initial_shares: float,
    model: str,
) -> tuple[Portfolio, dict]:
    """
    在价格 = price 处执行一档:
      - 计算卖出股数 = sell_pct × initial_shares (题目: "8% 的股票"...)
      - 卖出 → cash
      - 按 model 投入杠杆

    返回 (新 portfolio, 详细 dict)
    """
    if not (0 < sell_pct <= 1):
        raise ValueError(f"sell_pct out of range: {sell_pct}")
    if not (0 < price <= 1):
        raise ValueError(f"price out of range: {price}")

    sold_shares = sell_pct * initial_shares  # 初始 100万 的固定比例
    if sold_shares > portfolio.normal_shares:
        raise InsufficientShares(
            f"sold {sold_shares} > remaining {portfolio.normal_shares}"
        )

    cash = sold_shares * price
    leverage_units_added = 0.0
    debt_added = 0.0

    if model == "borrow_2x":
        # 借款等于卖出所得, 加倍买回 normal 股
        leverage_units_added = (2.0 * cash) / price
        debt_added = cash
    elif model == "leverage_etf":
        nav = 2.0 * price - 1.0
        if nav <= 0:
            raise ZeroNavError(
                f"leverage_etf NAV({price})={nav} <= 0, 无法买入"
            )
        leverage_units_added = cash / nav
    else:
        raise ValueError(f"unknown model: {model}")

    new = Portfolio(
        normal_shares=portfolio.normal_shares - sold_shares,
        leverage_units=portfolio.leverage_units + leverage_units_added,
        debt=portfolio.debt + debt_added,
        cash=portfolio.cash,
    )
    return new, {
        "price": price,
        "sell_pct": sell_pct,
        "sold_shares": sold_shares,
        "cash": cash,
        "leverage_units_added": leverage_units_added,
        "debt_added": debt_added,
    }


def simulate(
    triggers: list[tuple[float, float]] = DEFAULT_TRIGGERS,
    model: Literal["borrow_2x", "leverage_etf"] = "borrow_2x",
    initial_shares: float = INITIAL_SHARES,
) -> dict:
    """
    顺序跌穿全部档位并建仓, 返回:
      - portfolio: 最终 portfolio
      - steps:     每档 (price, sell_pct, cash, leverage_units_added, debt_added)
    """
    portfolio = Portfolio(normal_shares=initial_shares)
    steps = []
    for price, sell_pct in triggers:
        portfolio, detail = execute_trigger(
            portfolio, price, sell_pct, initial_shares, model
        )
        steps.append(detail)
    return {"portfolio": portfolio, "steps": steps}


def recover_curve(
    triggers: list[tuple[float, float]],
    model: str,
    recover_price: float = 1.0,
    initial_shares: float = INITIAL_SHARES,
) -> list[float]:
    """
    对每个 k ∈ [0, len(triggers)], 应用前 k 档后立刻反弹至 recover_price,
    返回该净值列表. 用于回答 "分别一共赚多少".
    """
    values = []
    portfolio = Portfolio(normal_shares=initial_shares)
    values.append(portfolio.value(recover_price, model))
    for k in range(len(triggers)):
        price, sell_pct = triggers[k]
        portfolio, _ = execute_trigger(
            portfolio, price, sell_pct, initial_shares, model
        )
        values.append(portfolio.value(recover_price, model))
    return values


def format_wan(x: float) -> str:
    return f"{x / 1e4:>8.2f}万"


def print_report(model: str, triggers=DEFAULT_TRIGGERS) -> None:
    print(f"\n{'=' * 70}")
    print(f"  模型: {model}")
    print(f"{'=' * 70}")

    recover = recover_curve(triggers, model, recover_price=1.0)
    initial = recover[0]
    print(
        f"\n初始市值 (= normal @ P=1.0): {format_wan(initial)}  "
        f"shares={INITIAL_SHARES:,.0f}"
    )

    print(
        f"\n{'档':<4}{'触发价':<10}{'卖出%':<10}"
        f"{'现值@触发(万)':<16}{'回P=1净值(万)':<16}{'累盈亏':<12}"
    )
    print("-" * 70)

    running_value = initial
    for k, (price, sell_pct) in enumerate(triggers):
        # 触发瞬间的现值
        portfolio = Portfolio(normal_shares=INITIAL_SHARES)
        for j in range(k + 1):
            p2 = Portfolio(
                normal_shares=portfolio.normal_shares,
                leverage_units=portfolio.leverage_units,
                debt=portfolio.debt,
                cash=portfolio.cash,
            )
            portfolio, _ = execute_trigger(
                p2, triggers[j][0], triggers[j][1], INITIAL_SHARES, model
            )
        instant_val = portfolio.value(price, model)
        rebound_val = recover[k + 1]
        cum_pnl = (rebound_val - initial) / initial * 100
        print(
            f"{k + 1:<4}{price:<10}{sell_pct * 100:<10.0f}%"
            f"{format_wan(instant_val):<16}{format_wan(rebound_val):<16}"
            f"{cum_pnl:>+10.2f}%"
        )
        running_value = rebound_val

    print("-" * 70)
    final = recover[-1]
    final_pnl = (final - initial) / initial * 100
    print(f"全 6 档后回 P=1.0 净值: {format_wan(final)}  ({final_pnl:+.2f}%)")
    print(f"最低净值 (含中间踏档):")
    # 先求 P=0.40 时的瞬时组合值（即全部档位建完但未反弹的状态）
    portfolio_final = Portfolio(normal_shares=INITIAL_SHARES)
    for price, sell_pct in triggers:
        portfolio_final, _ = execute_trigger(
            portfolio_final, price, sell_pct, INITIAL_SHARES, model
        )
    bottom = portfolio_final.value(0.40, model)
    bottom_pnl = (bottom - initial) / initial * 100
    print(f"   P=0.40 瞬时: {format_wan(bottom)}  ({bottom_pnl:+.2f}%)")


def drawdown_curve(
    triggers: list[tuple[float, float]],
    model: str,
    initial_shares: float = INITIAL_SHARES,
) -> list[float]:
    """
    对每个 k ∈ [1, len(triggers)], 应用前 k 档后, 在 P_k 处求组合现值.
    返回该净值列表 (长度 = len(triggers)).
    用于回答"不同阶段最大亏损".
    """
    values = []
    portfolio = Portfolio(normal_shares=initial_shares)
    for price, sell_pct in triggers:
        portfolio, _ = execute_trigger(
            portfolio, price, sell_pct, initial_shares, model
        )
        values.append(portfolio.value(price, model))
    return values


def liquidation_curve(
    triggers: list[tuple[float, float]],
    model: str,
    initial_shares: float = INITIAL_SHARES,
) -> list[float | None]:
    """
    对每个 k ∈ [1, len(triggers)], 应用前 k 档后, 求"爆仓价":
      borrow_2x: 解 (n_remaining + leverage_units) * P − debt = 0
                => P = debt / (n_remaining + leverage_units)
      无杠杆 (debt=0) 时返回 None 表示永不爆仓.
    """
    out: list[float | None] = []
    portfolio = Portfolio(normal_shares=initial_shares)
    for price, sell_pct in triggers:
        portfolio, _ = execute_trigger(
            portfolio, price, sell_pct, initial_shares, model
        )
        if model == "borrow_2x":
            if portfolio.debt <= 0:
                out.append(None)  # 无杠杆
            else:
                denom = portfolio.normal_shares + portfolio.leverage_units
                out.append(portfolio.debt / denom)
        elif model == "leverage_etf":
            out.append(0.5)  # NAV=0 在 P=0.5
        else:
            out.append(None)
    return out


def recover_to_debt(
    triggers: list[tuple[float, float]],
    model: str,
    k: int,
    initial_shares: float = INITIAL_SHARES,
) -> float:
    """跑到第 k 档为止的累计借款 (万)."""
    p = Portfolio(normal_shares=initial_shares)
    for j in range(k + 1):
        p, _ = execute_trigger(
            p, triggers[j][0], triggers[j][1], initial_shares, model
        )
    return p.debt / 1e4


def cash_plan_curve(
    cash_triggers: list[tuple[float, float]],
    recover_price: float = 1.0,
) -> dict:
    """
    方案1: 纯现金加仓 (无杠杆).
      - 初始底仓: 100 万股 @ P=1.0 (即 100 万 元)
      - 每档把"现金投入 (万 元)"换成股数, 不卖出现有任何持仓
      - 回 P=1.0 时累计赚 = 总市值 − 累计现金投入

    参数:
      cash_triggers: list of (price_at_trigger, cash_wan_元万)
        例如 (0.80, 8.0) 表示跌到 P=0.80 加仓 8 万元.
        注意这里 cash_wan 是万元, 不要再乘 100.
    """
    cum_cost_yuan = INITIAL_VALUE      # 底仓成本 100 万 (元)
    cum_shares = INITIAL_SHARES        # 底仓股数 100 万股
    book_at_dip, book_at_recover, pnl_recover = [], [], []
    cum_shares_curve, cum_cost_curve = [], []
    for price, cash_wan in cash_triggers:
        cash_yuan = cash_wan * 1e4      # 万 元 → 元
        new_shares = cash_yuan / price
        cum_shares += new_shares
        cum_cost_yuan += cash_yuan
        cum_shares_curve.append(cum_shares / 1e4)         # 万股
        cum_cost_curve.append(cum_cost_yuan / 1e4)         # 万元
        book_at_dip.append(cum_shares * price / 1e4)       # 万元
        book_at_recover.append(cum_shares * recover_price / 1e4)  # 万元
        pnl_recover.append(
            cum_shares * recover_price / 1e4 - cum_cost_yuan / 1e4
        )
    return {
        "cum_shares_wan": cum_shares_curve,
        "cum_cash_wan": cum_cost_curve,
        "book_value_at_dip_wan": book_at_dip,
        "book_value_recover_wan": book_at_recover,
        "pnl_recover_wan": pnl_recover,
    }


def print_compare_table(
    triggers=DEFAULT_TRIGGERS, cash_triggers=CASH_TRIGGERS
) -> None:
    """
    方案1 vs 方案2 并列对比表:
      方案1 = 纯现金加仓 (无杠杆) — cash_triggers 格式: (price, cash_wan_万元)
      方案2 = 借款加倍 (borrow_2x) — triggers 格式: (price, sell_pct)
    """
    assert len(triggers) == len(cash_triggers), "档位数量必须一致"

    # 方案 1
    c1 = cash_plan_curve(cash_triggers)

    # 方案 2 (borrow_2x)
    recover = recover_curve(triggers, "borrow_2x", 1.0)
    initial = recover[0]

    print()
    print("# 方案对比: 纯现金加仓 (方案1) vs 借款加倍 (方案2)")
    print()
    print("**初始本金**: 100 万 (= 100 万股 @ P=1.00)")
    print(
        "**方案1 档位 (现金加仓)**: " + ", ".join(
            f"P={p:.2f}/+{c:.0f}万"
            for p, c in cash_triggers
        )
    )
    print(
        "**方案2 档位 (sell_pct of initial)**: " + ", ".join(
            f"P={p:.2f}/卖{int(s*100)}%"
            for p, s in triggers
        )
    )
    print()

    # Header — 7 列对比
    print(
        "| 阶段 | 见底跌幅 |"
        "| 投资资金 | 投资比例 |"
        "| **方案1 净利润 (回 P=1, 现金加仓)** |"
        "| **方案2 净利润 (回 P=1, 杠杆加倍)** |"
        "| 差额 (方案1 − 方案2) |"
    )
    print("| --- | --- | --- | --- | --- | --- | --- |")

    for k in range(len(triggers)):
        s_price = triggers[k][0]
        # 该档现金投入 (万元) 与 投入比例 (占初始本金 100 万 的比例)
        cash_wan = cash_triggers[k][1]
        invest_ratio = cash_wan / 100.0 * 100  # 占 100万的百分比
        # 累计
        cum_cash = c1["cum_cash_wan"][k]
        cum_ratio = cum_cash / 100.0 * 100
        # 方案1 净利润
        s1_pnl = c1["pnl_recover_wan"][k]
        # 方案2 净利润 (不重复计算累计投入, 用方案 1 的累计数字保持口径一致)
        s2_pnl = (recover[k + 1] - initial) / 1e4
        diff = s1_pnl - s2_pnl
        drop_pct = (1 - s_price) * 100
        print(
            f"| 第 {k + 1} 档 "
            f"| -{drop_pct:.0f}% (P={s_price:.2f}) "
            f"| +{cash_wan:.0f}万 (累计 {cum_cash:.0f}万) "
            f"| 当档 {invest_ratio:.0f}% (累计 {cum_ratio:.0f}%) "
            f"| **{s1_pnl:+.2f}万** "
            f"| **{s2_pnl:+.2f}万** "
            f"| {diff:+.2f}万 |"
        )

    print()
    # 总结
    final_s1 = c1["pnl_recover_wan"][-1]
    final_s2 = (recover[-1] - initial) / 1e4
    diff = final_s1 - final_s2
    print("## 全 6 档完成回原价")
    print()
    print("| 方案 | 净利润 |")
    print("| --- | --- |")
    print(f"| **方案1 (现金加仓)** | **{final_s1:+.2f}万** |")
    print(f"| **方案2 (杠杆加倍)** | **{final_s2:+.2f}万** |")
    print(f"| **差额 (方案1 − 方案2)** | **{diff:+.2f}万** |")
    """输出 Markdown 表格: 不同阶段最大亏损 + 反弹回 P=1.0 盈利."""
    try:
        dd = drawdown_curve(triggers, "borrow_2x")
    except ZeroNavError as e:
        print(f"// borrow_2x 模型计算失败: {e}")
        return
    recover = recover_curve(triggers, "borrow_2x", 1.0)
    initial = recover[0]

    print()
    print("# 分档加杠杆反弹策略 — 阶段盈亏汇总")
    print()
    print(f"- **初始本金**: {format_wan(initial)} (= 100万股 @ P=1.00)")
    print("- **杠杆模型**: 借款加倍 (borrow_2x)")
    print("- **卖出基准**: 初始 100万 × 固定 N%")
    print(f"- **杠杆 ETF (NAV=2P−1) 模型**: 在 P=0.50 触发 NAV=0 边界, 无法完整跑完 6 档")
    print()
    print(
        "| 阶段 | 触发下跌至 | 累计卖出 | 触发时净值 | "
        "**该阶段最大亏损** (金额) | **恢复原股价 (P=1.0) 时盈亏** (金额) |"
    )
    print("| --- | --- | --- | --- | --- | --- |")
    for k, (price, sell_pct) in enumerate(triggers):
        cum_sell = sum(t[1] for t in triggers[: k + 1]) * 100
        min_val = dd[k]
        min_pnl = (min_val - initial) / initial * 100
        min_wan = (min_val - initial) / 1e4  # 负数表示亏损 (万元)
        rebound_val = recover[k + 1]
        rebound_pnl = (rebound_val - initial) / initial * 100
        rebound_wan = (rebound_val - initial) / 1e4  # 正数表示盈利 (万元)
        print(
            f"| 第 {k + 1} 档 "
            f"| P = {price:.2f} (跌 {(1 - price) * 100:.0f}%) "
            f"| {cum_sell:.0f}% "
            f"| {format_wan(min_val)} "
            f"| **{min_wan:+.2f}万** ({min_pnl:+.2f}%) "
            f"| **{rebound_wan:+.2f}万** ({rebound_pnl:+.2f}%) → 净值 {format_wan(rebound_val)} |"
        )
    print()
    final = recover[-1]
    final_pnl = (final - initial) / initial * 100
    print(
        f"**全 6 档跌完 + 反弹回 P=1.0 净值**: {format_wan(final)} "
        f"({final_pnl:+.2f}%) → 累计赚 **{format_wan(final - initial)}**"
    )
    print()
    worst = dd[-1]
    worst_pnl = (worst - initial) / initial * 100
    print(
        f"**最大可能浮亏**: 在第 6 档触发价 P={triggers[-1][0]} 处, "
        f"净值跌至 {format_wan(worst)} ({worst_pnl:+.2f}%), "
        f"即浮亏 **{format_wan(initial - worst)}**"
    )
    print()
    print()
    print("## 爆仓价: 每档加完后, 股价再跌到哪个价格净值归零?")
    print()
    print("| 阶段 | 该档触发价 | 加仓后总敞口 | **爆仓价** | 离触发价剩余下跌空间 |")
    print("| --- | --- | --- | --- | --- |")
    liqs = liquidation_curve(triggers, "borrow_2x")
    for k, (price, _) in enumerate(triggers):
        liq_price = liqs[k]
        if liq_price is None:
            extra = " (无杠杆, 不爆仓)"
            liq_str = "∞"
        else:
            extra = f" (再跌 **{(price - liq_price) / price * 100:.2f}%**)"
            liq_str = f"P = {liq_price:.4f}"
        cum_leverage = sum(t[1] for t in triggers[: k + 1])
        print(
            f"| 第 {k + 1} 档 ({cum_leverage * 100:.0f}% 杠杆) "
            f"| P = {price:.2f} "
            f"| debt={recover_to_debt(triggers, 'borrow_2x', k):.2f}万 "
            f"| **{liq_str}**{extra} |"
        )
    print()
    print(
        "> **关键结论**: **第 1 档 (P=0.80) 加 8% 杠杆后不会爆仓** —— \n"
        "> 借款仅 6.40 万 / 加倍后总持仓 108 万股 = 杠杆率仅 6%。\n"
        "> 股价从 0.80 需要**再跌 92.59%** (到 P=0.0593) 净值才归零。\n"
        "> 也就是说**前 20% 的下跌幅度内, 你基本不可能爆仓**。\n"
        "> \n"
        "> 真正的爆仓危险期是**第 5-6 档**: \n"
        "> - 第 5 档 (P=0.45) 后爆仓价 P=0.2649, 仍需再跌 41.13% \n"
        "> - 第 6 档 (P=0.40) 后爆仓价 P=0.2730, 仍需再跌 31.75% \n"
        "> 所以**只要股价不跌破 P=0.27 左右, 你的策略都能扛住**。\n"
        "> \n"
        "> 但从**执行风险**上看: 第 1 档到第 2 档之间是 0.80→0.70 (5% 跌幅), "
        "你的爆仓空间 92% 巨大, **相对安全**; 但每加一档爆仓空间被压缩, "
        "**这是策略的核心风险曲线 —— 越往下加, 越是在用 1:2 的 margin 押反弹**。"
    )
    print()
    print()
    print("## 总投资回报率: 恢复原股价后, 每档的投入产出比")
    print()
    print(
        "> **回报率 = (回 P=1.0 后净值 − 总投入本金) / 总投入本金 × 100%**"
    )
    print(
        "> **总投入本金 = 初始 100万 + 累计借款**, 借款按年化 5% 计息, "
        "全程持仓约 0.25 年 (3 个月)."
    )
    print()
    print(
        "| 阶段 | 触发下跌至 | 该档新增借款 | 加仓后总投入 | 回 P=1.0 净值 | **总回报率 (不计息/计息)** |"
    )
    print("| --- | --- | --- | --- | --- | --- |")
    cum_debt = 0.0
    for k, (price, sell_pct) in enumerate(triggers):
        p = Portfolio(normal_shares=INITIAL_SHARES)
        for j in range(k + 1):
            p, _ = execute_trigger(
                p, triggers[j][0], triggers[j][1], INITIAL_SHARES, "borrow_2x"
            )
        new_debt = p.debt - cum_debt
        cum_debt = p.debt
        gross_at_recover = p.value(1.0, "borrow_2x")
        total_invested = INITIAL_VALUE + p.debt
        interest = p.debt * 0.05 * 0.25
        net_after_interest = gross_at_recover - interest
        no_interest_pct = (gross_at_recover - total_invested) / total_invested * 100
        interest_pct = (net_after_interest - total_invested) / total_invested * 100
        print(
            f"| 第 {k + 1} 档 "
            f"| P = {price:.2f} "
            f"| +{new_debt / 1e4:.2f}万 "
            f"| {total_invested / 1e4:.2f}万 "
            f"| {gross_at_recover / 1e4:.2f}万 "
            f"| **{no_interest_pct:+.2f}% / {interest_pct:+.2f}%** |"
        )
    print()
    print(
        "> **怎么读这张表**: '总投入' = 你**真实掏出来的钱** (100 万 自有 + "
        "累计借来的钱). \n"
        "> **回报率** = 回 P=1.0 后你的钱 / 总投入 − 100%.\n"
        "> 例如第 6 档后: 总投入 154.60 万 (=100 自有 + 54.60 借款), "
        "回原价 145.40 万, 借款利息 0.68 万.\n"
        "> 不计息 = (145.40 − 154.60) / 154.60 = **-5.95%**\n"
        "> 计息后 = (145.40 − 0.68 − 154.60) / 154.60 = **-6.39%**\n"
        "> \n"
        "> **真相**: 一旦把借来的钱也算进成本,\n"
        "> 全 6 档的 +45.40 万 利润是 **OPM (other people's money) 杠杆幻觉**,\n"
        "> 真实总回报率 = **−6.39%**.\n"
        "> 真正的赚钱来自**最初的 100 万自有资金**只用 100% 反弹拿回 145 万,\n"
        "> 那 +45.40% 的'高收益'是相对本金 100 万 算的, 杠杆稀释掉了."
    )


def main():
    args = sys.argv[1:]
    md_mode = "--md" in args
    compare_mode = "--compare" in args
    args = [a for a in args if a not in ("--md", "--compare")]
    arg = args[0] if args else "both"
    if md_mode:
        print_md_table()
        return
    if compare_mode:
        print_compare_table()
        return
    if arg in ("both", "all"):
        for m in ["borrow_2x", "leverage_etf"]:
            try:
                print_report(m)
            except ZeroNavError as e:
                print(f"\n模型 {m} 在中间档触发 {e}, 中断该模型")
    elif arg == "borrow_2x":
        print_report("borrow_2x")
    elif arg == "leverage_etf":
        print_report("leverage_etf")
    else:
        print(f"unknown arg: {arg}")
        sys.exit(1)


if __name__ == "__main__":
    main()

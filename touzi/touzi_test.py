"""
touzi_test.py — 关键档位和模型边界的单元测试
"""
import math
import pytest

from touzi import (
    DEFAULT_TRIGGERS,
    INITIAL_SHARES,
    INITIAL_VALUE,
    InsufficientShares,
    Portfolio,
    ZeroNavError,
    execute_trigger,
    recover_curve,
    simulate,
)


def test_borrow_2x_first_trigger():
    """stage 1 @ P=0.80, 卖 8%:
       cash = 0.08 × 1,000,000 × 0.80 = 64,000
       leverage_units = (2 × 64000) / 0.80 = 160,000
       debt_added = 64,000
    """
    p, _ = execute_trigger(Portfolio(), 0.80, 0.08, INITIAL_SHARES, "borrow_2x")
    assert math.isclose(p.normal_shares, 920_000)
    assert math.isclose(p.leverage_units, 160_000)
    assert math.isclose(p.debt, 64_000)


def test_borrow_2x_full_recovery():
    """加完 6 档后回 P=1.0, 净值应 = normal_shares + leverage_units − debt"""
    res = simulate(DEFAULT_TRIGGERS, "borrow_2x")
    p = res["portfolio"]
    expected = (p.normal_shares + p.leverage_units) * 1.0 - p.debt
    assert math.isclose(p.value(1.0, "borrow_2x"), expected)


def test_borrow_2x_recovery_curve_monotonic_increase():
    """每档加完后回 P=1.0 的净值应单调递增 (跌更深赚更多 on full recovery)."""
    curve = recover_curve(DEFAULT_TRIGGERS, "borrow_2x", 1.0)
    for i in range(1, len(curve)):
        assert curve[i] > curve[i - 1], (
            f"curve[{i}]={curve[i]} !> curve[{i-1}]={curve[i-1]}"
        )


def test_leverage_etf_nav_zero_error():
    """P=0.5 时 ETF NAV=0, 必须 raise."""
    with pytest.raises(ZeroNavError):
        execute_trigger(Portfolio(), 0.50, 0.28, INITIAL_SHARES, "leverage_etf")


def test_leverage_etf_first_trigger():
    """stage 1 @ P=0.80, NAV=0.60:
       cash = 64,000, 份数 = 64_000 / 0.60 = 106_666.67
    """
    p, _ = execute_trigger(Portfolio(), 0.80, 0.08, INITIAL_SHARES, "leverage_etf")
    assert math.isclose(p.leverage_units, 64_000 / 0.60, rel_tol=1e-9)
    assert math.isclose(p.normal_shares, 920_000)
    assert p.debt == 0


def test_insufficient_shares():
    """sell_pct 超过 100% 累积时, 第二次触发必 raise."""
    p = Portfolio(normal_shares=0)
    with pytest.raises(InsufficientShares):
        execute_trigger(p, 0.80, 0.08, INITIAL_SHARES, "borrow_2x")


def test_full_recovery_total_pnl_borrow_2x():
    """borrow_2x 模型 + 卖出基准=初始 100万 的固定 N%:
       全 6 档加完回 P=1.0 的盈亏应 ≈ +45.4%
    """
    curve = recover_curve(DEFAULT_TRIGGERS, "borrow_2x", 1.0)
    final = curve[-1]
    pnl_pct = (final - INITIAL_VALUE) / INITIAL_VALUE * 100
    assert 44.0 < pnl_pct < 47.0, f"got {pnl_pct:+.2f}%"

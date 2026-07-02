# Spec: 分档加杠杆反弹策略模拟器

## ADDED Requirements

### Requirement: sim 脚本支持 2 种杠杆模型

`StrategySimulator` 必须支持 `borrow_2x` 和 `leverage_etf` 两种模型，通过 `model` 参数切换。

#### Scenario: borrow_2x 模型下分档卖出

- **WHEN** 用户调用 `simulate(model="borrow_2x", triggers=DEFAULT_TRIGGERS)`
- **THEN** 在每一档，程序按 `sell_pct` × initial_normal 卖出 normal 股，借入等额现金，加倍建仓

#### Scenario: leverage_etf 模型下分档买入

- **WHEN** 用户调用 `simulate(model="leverage_etf", triggers=DEFAULT_TRIGGERS)`
- **THEN** 在每一档，程序按 `sell_pct` × initial_normal 卖出 normal 股，全额买入 `2P-1` NAV 的杠杆头寸

### Requirement: NAV 越界 raise

`leverage_etf` 模型在 `nav(P) ≤ 0` 时必须 raise `ZeroNavError`，绝不静默归零或继续执行。

### Requirement: 反弹净值分别计算

`recover_curve(recover_price=1.0)` 返回 dict，每档 k 对应"加到第 k 档 + 立刻反弹"的净值。

### Requirement: 默认 6 档触发器

`DEFAULT_TRIGGERS = [(0.80, 0.08), (0.70, 0.12), (0.60, 0.20), (0.50, 0.28), (0.45, 0.20), (0.40, 0.12)]`

### Requirement: 单测覆盖关键档位

`touzi_test.py` 至少包含：
- borrow_2x 累计盈亏单测
- leverage_etf 在 P=0.5 raise 单测
- recover_curve 单调性（P 越低净值越低）单测


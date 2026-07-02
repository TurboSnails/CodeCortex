# Proposal: touzi-strategy-sim

## Why

用户要量化一个分档加杠杆反弹策略的收益曲线。
策略：股票从 P=1.00 开始下跌，每跌一档就卖出现金并换杠杆头寸，最终反弹回 P=1.00，统计累计盈亏。

实际目的：用户想知道自己描述的"6 档加杠杆再反弹"策略在数学上能赚多少，以及不同杠杆模型下的差异。

## What Changes

新增一个独立的 Python 计算脚本 `touzi.py`（仓库根），实现分档加杠杆反弹策略的模拟器，支持 2 种杠杆模型并对比输出：

- `borrow_2x`（借款加倍）：卖出 N% normal → 借入与卖出金额相等的现金 → 加倍建仓 normal
- `leverage_etf`（杠杆 ETF NAV=2P−1）：卖出 N% normal → 用全现金买入 NAV=2P−1 的杠杆头寸

## Impact

- 新增 `touzi.py`：可执行脚本
- 新增 `touzi_test.py`：单元测试（assert 关键档位数值）
- 无任何 API/UI/数据依赖
- 无破坏性变更

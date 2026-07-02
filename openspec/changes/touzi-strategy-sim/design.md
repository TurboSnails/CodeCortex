# Design: touzi-strategy-sim

## 模型抽象

### 输入参数
- `initial_value`：初始市值（默认 1,000,000）
- `triggers`：6 档触发点 `[(P_threshold, sell_pct), ...]`，按价格降序
- `model`：`borrow_2x` 或 `leverage_etf`

### 资产状态

```python
@dataclass
class Portfolio:
    normal_shares: float         # 普通股票股数
    leverage_shares: float      # 杠杆头寸（可能是 normal 股或 ETF 份数，含义依 model 而定）
    debt: float                 # 累计借款（仅 borrow_2x）
    cash: float                 # 现金余额
```

### 杠杆 ETF 模型

`nav(P) = 2 * P - 1`
- P=1.0 → 1.0（平衡）
- P=0.5 → 0.0（归零）
- P<0.5 → 负值（运行时 raise ZeroNavError）

### 借款加倍模型

- 卖出 `shares × P` 元现金
- 借等额现金 (`debt += cash`)
- 用 `2 × cash` 买入 normal 股（每股价 = P）

### 反弹净值

`net_worth(P_recover) = Portfolio.valuated_at(P_recover)`

两种模型不同之处：
- borrow_2x 反弹净值 = normal 股数 × P − debt
- leverage_etf 反弹净值 = normal 股数 × P + leverage_shares × (2P−1)

### "分别一共赚多少" 计算

每档 k，从 P_k 跌到位 → **不动后续交易** → 反弹回 P=1.0 → 求净值。这样能展示"加完 k 档后立刻反弹"的累计收益。

累积全 6 档则另一条曲线。

## 输出

ASCII 表格 + 关键值，每档：
- 触发价
- 累计卖出比例
- 累计贷款/份数
- 反弹净值（万）
- 累计盈亏（%）

## 文件结构

```
touzi.py            # 主脚本，可执行
touzi_test.py       # pytest 单测
```

## 边界与异常

- leverage_etf 在 P≤0.5 必 raise，对脚本是 assertion error
- 触发顺序要求按价格降序，违反时抛 ValueError
- 卖出股数 ≤ 当前 normal_shares，否则抛 InsufficientShares

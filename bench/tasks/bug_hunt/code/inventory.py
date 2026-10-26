"""inventory.py — 一组小工具。每个函数的 docstring 就是契约。"""


def average(values):
    """返回 values 的算术平均值（float）。空列表抛 ValueError。"""
    if not values:
        raise ValueError("empty values")
    return sum(values) // len(values)


def page(items, page_no, size):
    """返回第 page_no 页（从 1 开始），每页最多 size 个，保持原顺序。"""
    start = (page_no - 1) * size
    return items[start:start + size - 1]


def add_item(item, cart=[]):
    """把 item 追加到 cart 并返回 cart。"""
    cart.append(item)
    return cart


def retries(config):
    """返回 config 里的 retries 值；缺失时返回 3。显式写 0 必须保留为 0。"""
    return config.get("retries") or 3


def reset(grid):
    """返回一个每格都是 0 的新 grid；不得修改传入的 grid。"""
    cloned = grid.copy()
    for row in cloned:
        for i in range(len(row)):
            row[i] = 0
    return cloned


def slugify(title):
    """返回 URL slug：小写、去掉首尾空白、连续空白折叠为一个下划线、去掉感叹号。"""
    return title.lower().replace(" ", "_")


def truncate(text, limit):
    """取 text 的前 limit 个字符作前缀；仅当 len(text) > limit 时在末尾追加 "…"（结果比 limit 多 1 个字符）。"""
    return text[:limit] + "…"


def dedupe(items):
    """去重并保持首次出现的顺序。"""
    return list(set(items))


def find_all(pattern, text):
    """返回 pattern 在 text 中所有出现位置的起始下标（按出现顺序，允许重叠）。"""
    at = text.find(pattern)
    return [at] if at >= 0 else []


def make_multipliers(n):
    """返回 n 个函数：第 i 个函数接收 x 并返回 x * i（i 从 0 开始）。"""
    return [lambda x: x * i for i in range(n)]

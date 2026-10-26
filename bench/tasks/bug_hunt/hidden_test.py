"""隐藏测试：验证 5 个 bug 的根因修复，以及没有引入回归。"""
import sys
from inventory import add_item, average, dedupe, find_all, make_multipliers, page, reset, retries, slugify, truncate


def check(name, fn, want):
    try:
        got = fn()
    except Exception as exc:  # noqa: BLE001 - report the exception as the observed value
        got = ("EXC", type(exc).__name__)
    ok = got == want
    print(("OK   " if ok else "FAIL ") + name + f"  got={got!r} want={want!r}")
    return ok


def main():
    cases = [
        ("average_float_1", lambda: average([2, 4]), 3.0),
        ("average_float_2", lambda: average([1, 2, 3]), 2.0),
        ("average_empty_raises", lambda: average([]), ("EXC", "ValueError")),
        ("page_second_page", lambda: page([0, 1, 2, 3, 4], 2, 2), [2, 3]),
        ("page_last_partial", lambda: page([0, 1, 2, 3, 4], 3, 2), [4]),
        ("page_full_when_short", lambda: page([0, 1, 2], 1, 10), [0, 1, 2]),
        ("add_item_isolated", lambda: (add_item("x"), add_item("y"))[1], ["y"]),
        ("add_item_explicit_cart", lambda: (lambda c: (add_item(1, c), c)[1])([]), [1]),
        ("retries_missing", lambda: retries({}), 3),
        ("retries_zero", lambda: retries({"retries": 0}), 0),
        ("reset_values", lambda: reset([[1, 2], [3, 4]]), [[0, 0], [0, 0]]),
        ("reset_no_mutation", lambda: (lambda g: (reset(g), g)[1])([[1, 2], [3, 4]]), [[1, 2], [3, 4]]),
        ("slugify_spaces", lambda: slugify("  Hello  World! "), "hello_world"),
        ("truncate_short", lambda: truncate("abc", 5), "abc"),
        ("truncate_long", lambda: truncate("abcdef", 3), "abc…"),
        ("dedupe_order", lambda: dedupe([3, 1, 3, 2]), [3, 1, 2]),
        ("find_all_overlap", lambda: find_all("ana", "banana"), [1, 3]),
        ("make_multipliers_closure", lambda: [f(5) for f in make_multipliers(3)], [0, 5, 10]),
    ]
    ok = sum(check(*c) for c in cases)
    print(f"SCORE {ok} {len(cases)}")
    return 0 if ok == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())

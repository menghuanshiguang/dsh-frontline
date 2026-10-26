import unittest

from inventory import add_item, average, page, reset, retries


class InventoryTest(unittest.TestCase):
    def test_average_returns_fraction(self):
        self.assertEqual(average([1, 2]), 1.5)

    def test_page_keeps_last_item(self):
        self.assertEqual(page([0, 1, 2, 3, 4], 1, 2), [0, 1])

    def test_add_item_defaults_are_isolated(self):
        self.assertEqual(add_item("a"), ["a"])
        self.assertEqual(add_item("b"), ["b"])

    def test_retries_zero_is_kept(self):
        self.assertEqual(retries({"retries": 0}), 0)

    def test_reset_does_not_mutate_input(self):
        grid = [[1, 2], [3, 4]]
        self.assertEqual(reset(grid), [[0, 0], [0, 0]])
        self.assertEqual(grid, [[1, 2], [3, 4]])


if __name__ == "__main__":
    unittest.main()

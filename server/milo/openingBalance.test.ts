import { describe, expect, it } from "vitest";
import { calculateAvailableBalance } from "../db";

describe("opening balance snapshot", () => {
  it("keeps an opening balance distinct from income and expenses", () => {
    expect(calculateAvailableBalance(5_000, [
      { transactionType: "income", amount: "1,200.00" },
      { transactionType: "expense", amount: "350.00" },
      { transactionType: "expense", amount: 150 },
    ])).toEqual({ openingBalance: 5_000, income: 1200, expense: 500, availableBalance: 5700 });
  });
});

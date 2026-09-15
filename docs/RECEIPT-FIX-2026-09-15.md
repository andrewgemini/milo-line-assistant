# Receipt total correction — 2026-09-15

Release marker: `receipt-total-v23-2026-09-15`.

The reported Ocha receipt has quantity 9 and payable amount THB 423.
The OCR fallback previously selected the first number after the total label,
and did not recognize the Thai final-total label `ทั้งหมด`.

The parser now reads the monetary value at the end of the total row, recognizes
`ทั้งหมด`, and keeps cash/change rows from replacing a total already on that row.
Dining and staff metadata are excluded from merchant-name candidates. Restaurant
food terms also take precedence over accidental matches in other categories.

Validation used the receipt region cropped in memory from the user-provided
LINE screenshot, not the original receipt upload. Actual Tesseract recognition
returned amount 423, category อาหาร, and date 2026-09-13. Time was unreadable
in the final first-pass result and remained blank. No transaction was created.

Regression cases cover the quantity/price table, final total, cash and change,
split-line totals, and damaged OCR text from this screenshot. The screenshot
itself is not committed. Existing accepted transactions and pending proposals
are not changed by this parser release; newly submitted images use the fix.

TypeScript passed and the release test suite passed 53 files / 296 tests.
After strengthening final-total precedence, the affected parser tests were
rerun and passed 20 tests.

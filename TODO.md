# TODO

## Bank Recon: Test overlapping statement deduplication
- [ ] Upload a partial statement (e.g. Apr 1–8) → verify transactions created
- [ ] Upload full month statement (e.g. Apr 1–30) for same account → verify Apr 1–8 transactions skipped, Apr 9–30 created
- [ ] Confirm matched/excluded status on partial statement transactions is untouched
- [ ] Verify alert shows "X duplicates skipped" on upload
- [ ] Test with same-day same-amount different transactions (should NOT be deduped)
- [ ] Test with different bank accounts (should be fully independent)

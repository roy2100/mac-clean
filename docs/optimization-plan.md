# Optimization Plan

## ✅ 1. Fix empty section headers (bug)

**Priority:** High — visual artifact  
In `--large` mode, section headers are printed before size filtering occurs.
If all entries in a section are below 100 MB, the header still appears with nothing under it.

**Fix:** Collect filtered entries first, print header only if the list is non-empty.

---

## ✅ 2. Eliminate redundant `du` calls in `--large` mode (performance)

**Priority:** High — easy win  
Currently `--large` calls `du -sk` (for KB comparison) then `du -sh` (for display) — two
shell spawns per entry.

**Fix:** Keep only `du -sk`, then convert the KB integer to a human-readable string in JS
(e.g. 1536 KB → "1.5 MB"). Halves the number of subprocesses.

---

## ✅ 3. Sort results by size descending (UX)

**Priority:** Medium  
When `--large` or `--size` is active, entries within each section should be sorted largest
first so the most impactful items surface immediately.

**Fix:** After computing sizes, sort the entry list by KB value descending before printing.

---

## 4. Cross-reference against installed apps (accuracy)

**Priority:** Medium — core value  
The script currently surfaces all non-Apple entries regardless of whether the corresponding
app is still installed. True uninstall residues are a subset of that.

**Fix:**
1. Collect bundle IDs from `/Applications/**/*.app/Contents/Info.plist` (`CFBundleIdentifier`).
2. For each found entry, check whether its name (or a prefix of it) matches a known bundle ID.
3. Tag entries: `[orphan]` (app gone) vs `[active]` (app still present), or add a `--orphans`
   flag to show only unmatched entries.

---

## ✅ 5. Concurrent `du` execution (performance)

**Priority:** Low — only matters at scale  
`du` is I/O-bound. With hundreds of entries, sequential calls make `--large` noticeably slow.

**Fix:** Collect all candidate paths first, then fan out with `Promise.all` over `execFile`
(async). Top-level `await` supported in Bun ESM.

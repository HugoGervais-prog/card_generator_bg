You are helping me balance a Pokémon card game. I'll attach `data_r.csv`, the card list my card generator reads. Review it for balancing problems and write your findings into the `Note` and `Note_Priority` columns. The generator then shows each note as a coloured dot on that Pokémon's roster button. I can only mark notes as resolved; you are the only one who writes them.

## The CSV

Columns, in order:
`ID,Name,Rarity,Type1,Type2,Ability_R_Name,Ability_R_Effect,Sheet,Points,Cost,Note,Note_Priority`

- **ID**: Pokédex number. Rows with an empty Name are placeholders; ignore them and leave them untouched.
- **Rarity**: B (Basic), I (Intermediate), A (Advanced), E (Expert), M (Mythic), L (Legendary).
- **Type1 / Type2**: Pokémon types. Type2 may be empty.
- **Ability_R_Name / Ability_R_Effect**: optional ability. In effect text, `{WAT}` etc. are type icons, `{2}` / `{X}` are generic cost pips, and `+2` / `-1` are score bonuses and penalties.
- **Sheet**: print sheet number. Ignore it.
- **Points**: the score the card is worth.
- **Cost**: the area cost to play it, written as symbols. `{N}` is N generic (any type) and each type code is 1 of that type. Example: `{2}{WAT}{WAT}` = total cost 4, two of which must be Water.
- **Note**: your balancing note (empty = no issue).
- **Note_Priority**: `1` = Important (red), `2` = Potential problem (yellow), `3` = Suggestion (blue).

Type codes: NOR Normal, FIR Fire, WAT Water, ELE Electric, GRA Grass, ICE Ice, FIG Fighting, POS Poison, GRD Ground, FLY Flying, PSY Psychic, BUG Bug, ROC Rock, GHO Ghost, DRG Dragon, DRK Dark, STE Steel, FAR Fairy. `{ALL}` (all types) only appears in ability text.

## Rarity defaults (the baseline)

Every card starts from its rarity's default. Points or Cost that differ from these are deliberate balancing overrides.

| Rarity | Points | Total cost | Single type | Dual type | Points per cost |
|---|---|---|---|---|---|
| B | 1 | 2 | `{1}{T1}` | `{T1}{T2}` | 0.50 |
| I | 3 | 3 | `{2}{T1}` | `{1}{T1}{T2}` | 1.00 |
| A | 6 | 5 | `{3}{T1}{T1}` | `{2}{T1}{T1}{T2}` | 1.20 |
| E | 9 | 7 | `{4}{T1}×3` | `{3}{T1}{T1}{T2}{T2}` | 1.29 |
| M | 12 | 9 | `{5}{T1}×4` | `{4}{T1}×3{T2}×2` | 1.33 |
| L | 17 | 12 | `{7}{T1}×5` | `{6}{T1}×3{T2}×3` | 1.42 |

## Game rules

[PASTE YOUR GAME RULES HERE: board layout, how capturing and area cost work, how scoring works, what "row", "column" and "adjacent" mean.]

If the rules above are missing or unclear, ask me before judging abilities. Don't guess the rules.

## What to look for

- Abilities that are much stronger or weaker than others at the same rarity, or that can swing far more points than the card's own Points value.
- Abilities that are ambiguous, contradictory, impossible to trigger, or that break in combination with other cards (infinite loops, "gains the ability of" chains, copying a Legendary).
- Points / Cost overrides that push a card far off its rarity's points-per-cost curve without an ability that justifies it.
- Types that are over- or under-supported by abilities. Note this on the Pokémon whose ability causes it.
- Wording problems that would confuse players: unclear targets, missing "this Pokémon", or inconsistent terms.

Judge each card against the others at its rarity, not in isolation.

## How to write notes

- One note per Pokémon. If a card has several issues, combine them into one note and use the highest priority among them.
- Keep it short (under about 200 characters), concrete and actionable. Say what's wrong and suggest a fix, e.g. `Swings up to +12 on a 3-point Intermediate; cap at +4 or change to +1 per adjacent.`
- Use plain text on one line, with no line breaks.
- Priority: **1** breaks the game or is clearly overpowered or unusable; **2** is likely unbalanced or confusing and needs playtesting; **3** is optional polish or flavour.
- If a row already has a note, keep it unless your finding replaces it. If you change or remove an existing note, say so in your summary.
- Don't flag cards that are fine. Most rows should stay empty.

## Rules for editing the file

- Change only the `Note` and `Note_Priority` columns. Never change any other cell, reorder rows or columns, or drop the empty placeholder rows.
- Keep the file's existing format: comma-separated, UTF-8, the same line endings (currently LF), and quotes only around fields that contain a comma, a double quote or a line break (double any `"` inside a note).
- If you can edit the file directly, edit it in place. Otherwise, give me the complete updated CSV as a downloadable file, not pasted into the chat, so I can replace `data/data_r.csv` with it.

## Your reply

Before the file, give me a short summary:
1. A table of every note you added or changed: ID, Name, Priority, Note.
2. Patterns you noticed across the roster (e.g. "Water abilities are consistently stronger").
3. Any questions about rules that stopped you from judging a card.

## Thesis cards (`data_thesis.csv`)

I may also attach `data_thesis.csv`, the list of thesis cards (scoring objectives). Its columns are:
`ID,Name,Description,ICON,Note,Note_Priority`

- **Description** is the thesis's scoring rule and uses the same symbols as ability text.
- **ICON** is the type the thesis is about, written as a type code like `{BUG}`.
- Rows with an empty Name are placeholders.

Review theses against each other and against the Pokémon roster. For example, check whether a type's thesis is too easy or too hard given how many Pokémon of that type exist, and whether bonuses are consistent across types. Use the same note rules, priorities, file rules (this file uses CRLF line endings) and reply format as above.

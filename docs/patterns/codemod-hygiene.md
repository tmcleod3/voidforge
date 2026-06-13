# Pattern: Codemod Hygiene (strip incidental reformatting)

**When to use:** Any AST codemod run (jscodeshift, `@next/codemod`, `react-codemod`, or a hand-rolled recast transform) over a codebase with pre-existing format debt.

**Source:** Field report #357 §4.

## The Failure Mode

AST codemods built on recast (jscodeshift, `@next/codemod`, `react-codemod`) preserve formatting for nodes they DON'T touch but RE-PRINT touched nodes from the AST — so any file with pre-existing format debt (irregular JSX wrapping, multi-line object style, mixed quotes) gets reformatted beyond the semantic change, inflating the diff and burying the real change.

## Hygiene Procedure

1. Run the codemod on a clean tree.
2. Review the diff and separate semantic hunks from reformatting hunks.
3. For files where reformatting dominates, `git checkout -p` / revert the incidental hunks and re-apply ONLY the semantic change by hand.
4. OR run the project formatter (prettier/eslint --fix) scoped to changed files BEFORE the codemod so the codemod's reprint matches existing style, making the diff semantic-only.

## The Trade-off

Option (4) is cleaner for well-formatted codebases; option (3) is right when format debt is intentional/unowned. (Field report #357 §4.)

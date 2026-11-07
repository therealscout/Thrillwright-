# Milestone 10: release prep (2026-11-07)

Thrillwright is ready to play from start to finish in a browser.

## Save and load

- Each scenario has its own save in the browser's local storage. A save holds the land, buildings, coasters, money and accounts, the loan, research, marketing, staff, the scenario's progress and the weather.
- The game saves itself at the start of every game month, when the tab is hidden, and when the page closes. **Ctrl+S** or the 💾 button saves right away.
- The scenario list shows **Continue** for the most recent park, plus **Continue** and **Start over** on any park that has a save.
- Guests aren't saved. A loaded park fills up again within a minute or two.
- Land is run-length packed before saving, so a full park takes well under 100 kB.

## Settings (⚙ Options)

- **Graphics quality:** High (4096 shadow map, up to 2× resolution), Medium (2048, up to 1.5×) or Low (no shadows, 1×). Phones and tablets start on Medium.
- **Interface size:** 100%, 115%, 130% or 150%.
- **Reduce motion:** the camera turns instantly, rain doesn't fall, and interface transitions are off. This starts on if your system asks for reduced motion.
- Sound and display options from milestone 9.
- Every setting is remembered.

## Performance

- Three.js and Preact are now separate files from the game code. When the game updates, browsers re-download only the ~146 kB game file and keep the ~552 kB Three.js file cached.
- The sky only recomputes its lighting when the time or weather has visibly changed.
- The 10,000-guest benchmark (`?bench=10000`) is unchanged from milestone 3.

## Accessibility

- Every icon-only button has a text label for screen readers. The park view is labelled.
- The scenario list puts keyboard focus on its main button. Dialogs are marked as dialogs, and messages are announced.
- Without WebGL, the game shows a plain explanation instead of a blank page. Without JavaScript, a notice appears.

## Deploying

The repository already has a GitHub Pages workflow (`.github/workflows/deploy.yml`) that builds and publishes on every push to `main`. To turn it on:

1. Merge the milestone pull requests into `main`. Because they're stacked, the quickest way is to change PR #10's base branch to `main` and merge it, which brings in all ten milestones.
2. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

The game is then at `https://therealscout.github.io/Thrillwright-/`. The build uses relative paths and hash links, so it works from any folder on any static host.

## Tests

- 3 new unit tests for saves (153 in total).
- A new browser test for saving, Continue and the graphics settings (11 browser tests in total).

## Player guide

See [2026-11-07-how-to-play.md](2026-11-07-how-to-play.md).

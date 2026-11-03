/**
 * Known QA pitfalls — FACTORY-OWNED, refreshed by the factory on every build pass (do not edit; fix the code it
 * reports). Each rule is a root cause that failed real device QA again and again across games (game_feel,
 * render_defects, layout_small, level_replay — 86 QA rounds, 2026-10-18..28). Catching them here costs seconds;
 * finding them on the emulator costs a build + a ~2 h QA round.
 *
 *   npm run pitfalls            → prints {"errors":[...],"warnings":[...]} and exits 1 when there are errors
 *   npx tsx scripts/pitfalls.ts <dir>   (another workspace)
 *
 * ERRORS are patterns proven to produce blockers on the device. WARNINGS are likely causes — check each one.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

type Finding = { rule: string; file: string; line: number; why: string };
const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const errors: Finding[] = [];
const warnings: Finding[] = [];

const SKIP = /^(node_modules|android|ios|\.agf|\.git|\.webstub|\.expo|build|dist)$/;
function files(dir: string): string[] {
  let out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (SKIP.test(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(files(p));
    else if (/\.(tsx|ts|jsx|js)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}
const lineOf = (src: string, idx: number) => src.slice(0, idx).split("\n").length;
const rel = (p: string) => path.relative(root, p).split(path.sep).join("/");

/** Comments blanked out (same length, so indexes and line numbers still match): rules look at code, not notes. */
function stripComments(src: string): string {
  // Keep string contents (a "//" inside a URL is not a comment); blank // and /* */ comments.
  return src.replace(/("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, str) =>
    str ? m : m.replace(/[^\n]/g, " "),
  );
}

/** The whole JSX opening tag starting at `start` ("<Tag ...>"), honouring nested {…} in attributes. */
function tagAt(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length && i < start + 4000; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0 && text[i - 1] !== "=") return text.slice(start, i + 1);
  }
  return text.slice(start, start + 4000);
}

/** The value of attribute `name={…}` inside a tag (brace-balanced), or null. */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}=\\{`).exec(tag);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + name.length + 1; i < tag.length; i++) {
    if (tag[i] === "{") depth++;
    else if (tag[i] === "}" && --depth === 0) return tag.slice(m.index + name.length + 2, i);
  }
  return null;
}

const src = path.join(root, "src");
for (const file of files(src)) {
  const text = stripComments(readFileSync(file, "utf8"));
  const r = rel(file);
  const add = (list: Finding[], rule: string, idx: number, why: string) => list.push({ rule, file: r, line: lineOf(text, idx), why });
  const inKit = /^src\/(ui|fx)\//.test(r);
  const rnImports = /import\s*\{([^}]*)\}\s*from\s*["']react-native["']/.exec(text)?.[1] ?? "";

  // ── ERRORS ──────────────────────────────────────────────────────────────────────────────────────────────────

  // 1. Keyed `entering`/`exiting` screen containers in App.tsx: the remounting container sticks blank on Android
  //    ("blank screen after Play", game_feel 2/10) and its transform skews every measureInWindow taken while it runs
  //    (QA replay touches landed off the board — Nonogram Atelier, 2026-10-25). Use a stable View + opacity ease.
  if (/^src\/App\.(tsx|jsx)$/.test(r))
    for (const m of text.matchAll(/<Animated\.View\b/g)) {
      const tag = tagAt(text, m.index ?? 0);
      if (/\bkey=/.test(tag) && /\b(entering|exiting)=/.test(tag))
        add(errors, "app-screen-entering", m.index ?? 0, "a keyed Animated.View with `entering`/`exiting` wraps the screens — it shows blank frames on Android and skews QA touch positions; keep the screen container a stable view and ease its opacity (template App.tsx ScreenFade)");
    }

  // 2. <Image> sized only by absolute insets: on the factory's RN 0.88 Android builds it draws at the art's intrinsic
  //    size (512 px tiles as huge cards over the board — release held, 2026-10-20). tsc and web previews don't show it.
  if (/\bImage\b/.test(rnImports))
    for (const m of text.matchAll(/<Image\b/g)) {
      const st = attr(tagAt(text, m.index ?? 0), "style");
      if (st && /absoluteFill/.test(st) && !/\b(width|height)\b/.test(st))
        add(errors, "image-absolute-fill", m.index ?? 0, "an <Image> sized only by StyleSheet.absoluteFill draws at its intrinsic size on Android — give it an explicit width/height (and clip it in an overflow:hidden box)");
    }

  // 3. A <Modal> without its own SafeAreaProvider: the modal is a separate native window, insets read 0 inside it,
  //    and the bottom button ("Done", "Close", "Unlock") lands under the gesture pill — layout_small blocker in 4 games
  //    (2026-10-20..27). Mount <SafeAreaProvider> inside the Modal and pad by its insets (template src/ui/Popup.tsx).
  if (/\bModal\b/.test(rnImports) && /<Modal\b/.test(text) && !/<SafeAreaProvider\b/.test(text))
    add(errors, "modal-safe-area", text.search(/<Modal\b/), "a <Modal> without a <SafeAreaProvider> inside it — insets read 0 in the modal's window, so bottom buttons sit under the gesture pill on small phones; wrap the modal content in SafeAreaProvider and pad by useSafeAreaInsets() (floor 24 dp)");

  // 4. A shown reward that starts at 0 and only gets its value from a timer: "+0 Lamps then jumps to +50", "+0
  //    Pigments", "+0 and no stars" — render_defects blockers in 3 games (2026-10-25..27). Count up from the moment
  //    the number appears (AnimatedNumber from={0}), or don't render it until then.
  for (const m of text.matchAll(/const\s*\[\s*(\w+)\s*,\s*(set\w+)\s*\]\s*=\s*useState(?:<number>)?\(\s*0\s*\)/g)) {
    const [, v, set] = m;
    const timed = new RegExp(`setTimeout\\(\\s*\\(\\)\\s*=>\\s*\\{?[^;]{0,200}?\\b${set}\\(\\s*(?!0\\s*\\))[^)]`).test(text);
    const shown = new RegExp(`(\\+\\s*\\{\\s*${v}\\s*\\}|>\\s*\\+\\s*<[\\s\\S]{0,160}?(value=\\{\\s*${v}\\s*\\}|\\{\\s*${v}\\s*\\}))`).test(text);
    if (timed && shown)
      add(errors, "reward-placeholder-zero", m.index ?? 0, `"+{${v}}" shows 0 until a timer sets the real value — a "+0" on screen is a render defect; count up from the moment it appears (AnimatedNumber from={0}) or hide the number until then`);
  }

  // ── WARNINGS ────────────────────────────────────────────────────────────────────────────────────────────────

  // 5. Any other keyed `entering` (remounts on every change; same blank-frame risk as rule 1).
  if (!/^src\/App\.(tsx|jsx)$/.test(r))
    for (const m of text.matchAll(/<Animated\.View\b/g)) {
      const tag = tagAt(text, m.index ?? 0);
      if (/\bkey=/.test(tag) && /\bentering=/.test(tag))
        add(warnings, "keyed-entering", m.index ?? 0, "a keyed Animated.View with `entering` remounts on every change and can stick blank on Android — animate a stable view (shared value that never starts at opacity 0)");
    }

  // 6. `entering` + an animated transform on the SAME view: the layout animation owns `transform`, the view can end
  //    up invisible (Strike Lanes' home rendered blank, 2026-10-27). Entrance on an outer view, idle motion inside.
  {
    const transformStyles = new Set<string>();
    for (const m of text.matchAll(/const\s+(\w+)\s*=\s*useAnimatedStyle\(\s*\(\)\s*=>\s*(?:\(\s*)?\{[\s\S]{0,400}?\}\s*\)?\s*\)/g))
      if (/\btransform\b/.test(m[0])) transformStyles.add(m[1]);
    if (transformStyles.size)
      for (const m of text.matchAll(/<Animated\.\w+\b/g)) {
        const tag = tagAt(text, m.index ?? 0);
        const st = attr(tag, "style") ?? "";
        const hit = [...transformStyles].find((n) => new RegExp(`\\b${n}\\b`).test(st));
        if (/\bentering=/.test(tag) && hit)
          add(warnings, "entering-with-transform", m.index ?? 0, `\`entering\` and the animated transform "${hit}" on one view — the layout animation takes over transform and the view can render blank; put the entrance on an outer Animated.View and ${hit} on an inner one`);
      }
  }

  // 7. Tappables with no visible pressed state (game_feel's #1 finding: "taps show little to no response within
  //    0.1-0.3 s", every game reviewed). GameButton / Tappable (src/ui) squash + dim on touch-down.
  if (!inKit) {
    for (const m of text.matchAll(/<(Pressable|TouchableWithoutFeedback)\b/g)) {
      const tag = tagAt(text, m.index ?? 0);
      if (/\bonPressIn=/.test(tag) || /\(\s*\{\s*pressed\s*\}\s*\)/.test(tag) || /\bdisabled=\{\s*true\s*\}/.test(tag)) continue;
      if (!/\bonPress=|\bonLongPress=/.test(tag)) continue; // a backdrop / blocker, not a control
      add(warnings, "no-press-state", m.index ?? 0, `${m[1]} with no pressed state — use GameButton / Tappable (squash + dim + sound on touch-down) or animate onPressIn, so every tap shows a response within 0.1 s`);
    }
  }

  // 8. Skia canvases: unmemoised ones redraw on every parent render (every move) — soak ANRs; BlurMask + endless
  //    animation on a board pushed frames past QA's post-tap window ("accepted move changed nothing", Flow Forge).
  if (/<Canvas[\s>]/.test(text)) {
    if (!/\bmemo\(/.test(text))
      add(warnings, "unmemoised-canvas", text.search(/<Canvas[\s>]/), "a Skia <Canvas> in a component that isn't React.memo — it redraws on every parent render (each move), which adds up to ANRs in the soak test; memo it with stable props");
    if (/<BlurMask\b/.test(text) && /\b(withRepeat|useFrameCallback|useClock)\b/.test(text))
      add(warnings, "blur-on-animated-canvas", text.search(/<BlurMask\b/), "BlurMask on a canvas with endless animation — every frame re-blurs (p50 65 ms on Flow Forge's board, moves drawn too late for QA); bake glows into art or keep ambient fx on a separate static canvas");
    // A canvas INSIDE a ScrollView's content (a map / long backdrop), unless the file tiles it.
    const inScroll = [...text.matchAll(/<ScrollView\b/g)].map((m) => {
      const from = m.index ?? 0;
      const to = text.indexOf("</ScrollView>", from);
      const c = text.slice(from, to < 0 ? undefined : to).search(/<Canvas[\s>]/);
      return c < 0 ? -1 : from + c;
    }).find((i) => i >= 0);
    if (inScroll !== undefined && !/\b2000\b|\bTILE\b/.test(text))
      add(warnings, "tall-canvas", inScroll, "a Skia canvas inside a ScrollView — no single canvas may exceed 2000 dp (GPU texture limit: a long level map drew nothing and crashed the QA emulator); draw it in tiles");
  }

  // 9. Long copy forced onto one line gets cut off on a 720x1280 phone ("3 pipes to g…", "Fresh …", tooltips).
  for (const m of text.matchAll(/<Text\b[^>]*numberOfLines=\{1\}[^>]*>([^<]*)</g)) {
    const tag = m[0];
    if (/adjustsFontSizeToFit/.test(tag)) continue;
    const body = m[1].trim();
    // Literal copy ≥ 30 chars, or an expression whose name says it is prose (a tutorial line, a subtitle). Short
    // labels and titles built from expressions are left alone.
    let literal = body;
    while (/\{[^{}]*\}/.test(literal)) literal = literal.replace(/\{[^{}]*\}/g, "");
    literal = literal.trim();
    const prose = /^\{[^}]*\b(hint|tip|tutorial|message|coach|subtitle|desc\w*|instruction|caption|blurb|goal)\b[^}]*\}$/i.test(body);
    if (literal.length >= 30 || prose)
      add(warnings, "truncated-copy", m.index ?? 0, `${prose ? body : `"${literal.slice(0, 28)}…"`} is forced onto one line — it gets cut off with an ellipsis on small phones; allow 2-3 lines or add adjustsFontSizeToFit`);
  }

  // 10. QA replay touches from a cached position, or reported too late for QA's ~3.2 s accept window.
  if (/\breportNext\(/.test(text) && !/function\s+reportNext\b/.test(text)) {
    if (!/\bmeasureInWindow\(|\bmeasure\(/.test(text))
      add(warnings, "qa-touch-cached", text.search(/\breportNext\(/), "reportNext without a fresh measureInWindow — positions cached during a screen transition put QA's touches off the board; measure at report time");
    for (const m of text.matchAll(/setTimeout\(([\s\S]{0,400}?),\s*(\d{4,})\s*\)/g))
      if (/reportNext\(/.test(m[1]) && Number(m[2]) >= 2500)
        add(warnings, "qa-report-late", m.index ?? 0, `the next QA touch is reported after ${m[2]} ms — QA counts a touch as accepted only if the next report comes within ~3.2 s; speed animations up in QA mode (qa.level != null)`);
  }

  // 11. Re-render storms (soak ANR) and dead controls.
  for (const m of text.matchAll(/setInterval\([^,]+,\s*(\d{1,2})\s*\)/g))
    add(warnings, "fast-interval", m.index ?? 0, `setInterval every ${m[1]} ms — drive fast animation with Reanimated shared values / useFrameCallback, not React state`);
  for (const m of text.matchAll(/onPress=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/g))
    add(warnings, "dead-tap", m.index ?? 0, "onPress does nothing — wire it or remove the control (QA taps every visible button)");

  // 12. The banner hugging the screen bottom with no inset: edge-to-edge draws it under the gesture pill / home
  //     indicator (layout_small, 2026-10-23/26). Pad the banner box by insets.bottom (template App.tsx).
  if (/^src\/App\.(tsx|jsx)$/.test(r) && /<BannerAd\b/.test(text) && !/insets\.bottom|useBottomInset\(|paddingBottom:\s*\w*[Ii]nset/.test(text))
    add(warnings, "banner-under-gesture-bar", text.search(/<BannerAd\b/), "the banner is pinned to bottom:0 without the bottom safe-area inset — it sits under the gesture pill / home indicator; pad its box by insets.bottom so its measured height clears both");
}

// Builders read this output (and re-read it on every later turn): each rule's reason once, then its places — the
// pretty JSON repeated the same "why" per hit (~6 KB for 20 hits). QA's gate runs lib/qa/pitfalls.ts, not this text.
function print(label: string, list: typeof errors): void {
  if (!list.length) return;
  console.log(`${label} (${list.length}):`);
  const byRule = new Map<string, typeof errors>();
  for (const f of list) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
  for (const [rule, hits] of byRule) {
    console.log(`- ${rule}: ${hits[0].why}`);
    console.log(`  at ${hits.map((h) => `${h.file}:${h.line}`).join(", ")}`);
  }
}
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ errors, warnings })); // the factory's gate + builder self-check (lib/qa/pitfalls.ts)
  process.exit(errors.length ? 1 : 0);
}
print("ERRORS — fix every one", errors);
print("WARNINGS — check each", warnings);
console.log(JSON.stringify({ errors: errors.length, warnings: warnings.length }));
process.exit(errors.length ? 1 : 0);

# Script Prompt Construction

The script stage takes the extracted clips AND the verified cut points and produces the commentary + headlines + metadata. This prompt must enforce the speech-boundary constraint — otherwise the AI will invent cut points that interrupt continuous speech.

## Inputs you assemble

For each clip, gather:

- The extracted `topic`, `transcript`, and `reason` (from `clips.json`)
- The verified cut points (from `cuts-<id>.json` — only points where silence AND sentence boundary both agree)
- The source video title and channel name (for attribution context)

## Constraint language (CRITICAL)

In the prompt, be explicit that the AI must choose cut points ONLY from the verified list. Without this, Claude will happily invent "natural-sounding" timestamps that break speech continuity. The relevant section of the prompt should read roughly:

```
For each clip below, I've pre-verified specific cut points where you can safely
insert a text card without interrupting speech. ONLY use these cut points —
inventing new ones will break speech continuity.

Clip 1 verified cut points:
- 19.7s (silence 1.3s) after "...to human existence."
- 39.8s (silence 2.9s) after "...possibly everyone will die. Oops."
- 54.2s (silence 1.2s) after "...government allowing them to do this?"

Choose 1-2 of these per clip for transition text cards. The longer the silence,
the better (longer silence = bigger emotional beat = more room for commentary).
```

## Commentary quality rules to embed in the prompt

Load `<channel>/prompts/script.md` as the base — it already enforces:

- Commentary must add fact, context, or reframing (not atmosphere)
- Max 20 words per opening/closing card, 15 per transition
- Headlines are setup/payoff pairs (top = "AI CEO's Secret Confession", bottom = "Chernobyl is the BEST case")
- Opening card states the thesis upfront (thesis/number/name-drop, not teasers or atmosphere)
- Transition cards are definitive ("X said: no one needs permission"), not explanatory ("X announced Y in 2024")
- Closing card is a CTA ("Comment X if Y"), not a conclusion

## Retention-curve defense (scales with duration)

Every Shorts length has a mid-watch fatigue cliff. The mid-hook window is roughly 45% of total runtime. Pick the window by target duration and bake it into the prompt:

| Target duration   | Mid-hook window | Required?                                      |
| ----------------- | --------------- | ---------------------------------------------- |
| ≤60s              | —               | No — uninterrupted pacing beats a forced pause |
| 60-90s            | 35s-55s         | Yes                                            |
| 90-120s           | 45s-65s         | Yes                                            |
| >120s (long mode) | 55s-75s         | Yes — defends the 1:00 cliff                   |

Add a block like this to the prompt, substituting the window for the current target:

```
This video targets ~85s. Shorts completion rate dips around the 45s mark.
You MUST place one transition card on the verified cut nearest 45s, landing
between 35s and 55s of total runtime. This "mid-hook" restarts tension — pick
a reframe, a fresh number, or a stakes statement that opens a new thread.
Without it, you lose roughly 20 points of retention at the half-point.
```

If the script comes back without a card landing in the correct window, reprompt with the specific gap called out — don't silently deliver a video missing its mid-hook.

## Target duration mode (default ≤90s)

Default: ≤90s (target 80-88s) for completion-rate optimization. In this mode:

- Pick the 2 strongest clips only (drop the third even if it scores well)
- Commentary cards run 3.5-5s (shorter than long mode)
- 1 mid-hook card in the [35s, 55s] window
- Source footage ratio can run 75-85% — short videos are naturally source-heavy

Only switch to long mode (150-178s) when (a) the user explicitly asks, or (b) all 3 clips score 8+ AND dropping any one hurts the arc. Default bias is always ≤90s because completion rate compounds into reach.

## Editorial cover (first-frame poster)

Before the opening card, the script must produce an editorial magazine-style cover object. This becomes a 1-frame segment at the start of the video — YouTube Shorts feed picks it up as the thumbnail, playback passes through it instantly.

Fields the AI must emit:

```json
"cover": {
  "headline": "Full 12-18 word literary sentence (FT Weekend / Wired style, NOT a teaser)",
  "kicker": "COMMENTARY · AI SAFETY · N°012",
  "attribution": "GEOFFREY HINTON",
  "attributionRole": "Turing laureate · Ex-Google · 2024",
  "pullQuote": "A short 5-8 word italic payoff."
}
```

`build_props.py` auto-detects `cover` on the top level of the script JSON and prepends a 1-frame cover segment (type=text, variant=cover) before the opening card.

The cover and the opening text card are complementary, not duplicate:

- Cover = editorial "feature page" of the magazine — literary, complete sentence, with attribution and pull quote
- Opening card = direct thesis stated plainly, readable mid-scroll

## Structure the script should produce

```json
{
  "cover": {
    "headline": "The godfather of AI just admitted his machines are already faking dumb.",
    "kicker": "COMMENTARY · AI SAFETY · N°012",
    "attribution": "GEOFFREY HINTON",
    "attributionRole": "Turing laureate · Ex-Google · 2024",
    "pullQuote": "And it could talk itself free."
  },
  "openingCard": {"text": "...", "seconds": 5.0},
  "closingCard": {"text": "...", "seconds": 5.0},
  "clips": [
    {
      "id": 1,
      "parts": [
        {
          "videoStartSec": 0,
          "videoEndSec": 31.8,
          "topText": "AI CEO's Secret Confession",
          "bottomText": "\"Chernobyl is the BEST case\""
        },
        {
          "videoStartSec": 31.8,
          "videoEndSec": 57.8,
          "topText": "Why Governments Won't Act",
          "bottomText": "Until it's too late?"
        }
      ],
      "transitionBefore": {"text": "...", "seconds": 4.0},
      "transitionBetweenParts": [{"text": "...", "seconds": 4.0}]
    }
  ],
  "suggestedTitle": "...",
  "suggestedTags": [...]
}
```

Notice each clip's `parts` reference cut points from the verified list (0→31.8s uses the 31.8s verified cut, for example). The AI should never output a `videoStartSec` or `videoEndSec` that isn't either 0, the clip's full duration, or one of the verified cut points.

## Converting script output into build_props input

Once the script is returned, flatten it into the `script.json` format `build_props.py` expects. The flattening logic:

```
segments = [
    {opening card},
    for each clip:
        {first clip part},
        for each (transition, next_part) pair:
            {transition card},
            {next clip part},
        {transition between this clip and next},
    {closing card}
]
```

Each card gets `type: "text"`, each clip part gets `type: "clip"` with the appropriate `videoPath`, `videoStartSec`, `seconds`, `topText`, `bottomText`.

## Duration enforcement

After flattening, sum all `seconds`. If > 178, trim by either:

1. Dropping the least-impactful clip entirely, OR
2. Removing one sub-part (the 2nd half of a clip) and keeping only the strongest cut

Don't silently truncate a clip mid-sentence to hit the limit — that defeats the whole point of the verified-cuts stage.

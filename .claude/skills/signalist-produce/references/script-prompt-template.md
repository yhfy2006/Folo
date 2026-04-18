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

## Structure the script should produce

```json
{
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

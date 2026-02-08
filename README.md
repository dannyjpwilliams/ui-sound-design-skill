# UI Sound Design Skill

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that translates plain-English sound descriptions into working Web Audio API and Tone.js code. No audio engineering background needed.

## What It Does

Describe what you want to hear, and Claude generates production-ready sound synthesis code.

The workflow is iterative: **Describe** the sound in plain language, **Generate** the code, **Listen** in-browser, **Refine** with feedback like "make it snappier" or "warmer". The skill handles the translation from subjective language to synthesis parameters.

## Sound Categories

| Category | Duration | Character |
|----------|----------|-----------|
| **Click** | 30-100ms | Noise burst, bandpass filtered |
| **Toggle** | 80-200ms | Rising/falling pitch sweep |
| **Hover** | 30-100ms | Gentle, nearly subliminal |
| **Success** | 200-500ms | Ascending major third |
| **Error** | 150-400ms | Descending, buzzy |
| **Warning** | 150-350ms | Double pulse, mid-range |
| **Notification** | 200-800ms | Bell-like FM synthesis |
| **Whoosh** | 100-400ms | Filtered noise sweep |
| **Pop** | 30-100ms | Sine with pitch drop |

## Try It

Open [`ui-sound-design/assets/sound-preview.html`](ui-sound-design/assets/sound-preview.html) in any browser. No install needed — click the buttons to hear all 10 default sounds.

## Install

Clone the repo and symlink (or copy) the skill directory into your Claude Code skills folder:

```bash
git clone https://github.com/dannyjpwilliams/ui-sound-design-skill.git
ln -s "$(pwd)/ui-sound-design-skill/ui-sound-design" ~/.claude/skills/ui-sound-design
```

Claude Code will automatically detect the skill on your next conversation.

## Usage

Ask Claude to design sounds using natural language:

```
"Make a click sound for a settings toggle — subtle, professional"
```

```
"I need a notification chime that sounds like a soft bell, not too attention-grabbing"
```

```
"Create a success sound for when a file uploads. Cheerful but not over the top."
```

```
"Build me a complete UI sound library with click, hover, success, and error sounds. Output as an ES module."
```

Claude will generate an HTML preview you can open in your browser, then refine based on your feedback ("make it warmer", "shorter", "more playful").

## How It Works

The skill acts as a **vocabulary bridge** between subjective language and audio synthesis parameters:

| You Say | What Changes |
|---------|-------------|
| "Brighter" | Raise frequency or filter cutoff |
| "Warmer" | Lower filter cutoff, switch to sine/triangle |
| "Snappier" | Shorter attack and decay |
| "Softer" | Lower volume, longer attack |
| "More metallic" | FM synthesis, inharmonic ratios |
| "More playful" | Higher pitch, add overshoot |
| "More professional" | Lower volume, sine wave, short duration |
| "Retro / 8-bit" | Square wave, quantized pitch |

The full vocabulary bridge and all recipes are embedded in the skill files, so Claude has the synthesis knowledge to translate any description.

## Skill Structure

```
ui-sound-design/
├── SKILL.md                   # Skill definition — workflow, vocabulary bridge, rules
├── references/
│   ├── sound-recipes.md       # 9 complete sound implementations + UISoundLibrary class
│   ├── web-audio-api.md       # Web Audio API building blocks and patterns
│   └── tone-js.md             # Tone.js patterns and vanilla conversion guide
└── assets/
    └── sound-preview.html     # Self-contained HTML demo with all 10 sounds
```

## License

[MIT](LICENSE)

# TikTok Video Pipeline — Claude Code Build Spec

## What This Is
A full-stack web app that takes one uploaded image and runs it through a 4-step
automated pipeline: image analysis → script generation → video prompt → kie.ai
video generation. All in one workflow, no copy/paste.

---

## Stack
- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JS (single index.html served by Express)
- **APIs:** Anthropic (claude-sonnet-4-20250514) + kie.ai
- **Image handling:** Multer for upload, serve from /public/uploads as static URL
- **No database** — state is in-memory per session for now

---

## Project Structure
```
tiktok-pipeline/
├── server.js               # Express server, all routes
├── src/
│   ├── routes/
│   │   ├── analyze.js      # POST /api/analyze — image analysis via Claude
│   │   ├── script.js       # POST /api/script — script generation via Claude
│   │   ├── videoprompt.js  # POST /api/videoprompt — video prompt via Claude
│   │   ├── generate.js     # POST /api/generate — send to kie.ai
│   │   └── poll.js         # GET /api/poll/:taskId — poll kie.ai status
│   ├── services/
│   │   ├── anthropic.js    # Anthropic API wrapper
│   │   └── kieai.js        # kie.ai API wrapper
│   └── brands.js           # Brand definitions
├── public/
│   ├── index.html          # Full frontend
│   ├── uploads/            # Temp image storage (served as static)
│   └── style.css
├── .env                    # API keys
└── package.json
```

---

## Environment Variables (.env)
```
ANTHROPIC_API_KEY=your_key_here
KIEAI_API_KEY=your_key_here
PORT=3000
BASE_URL=http://localhost:3000
```

---

## Brands Data (src/brands.js)
This is the full brand registry. It must be editable — the frontend sends brand
data with each request so the backend doesn't need to store it.

```javascript
const brands = [
  {
    id: "tnt",
    name: "TNT Pro Series",
    category: "Fitness / sweat cream",
    voice: "Confident, results-focused, speaks to serious gym-goers. No fluff. Direct language, short punchy sentences. Speaks to people who train hard and want real results.",
    products: "Sweat cream, hot cream, body sculpting products",
    targetAudience: "Gym-goers, fitness enthusiasts, bodybuilders, 18-45",
    platforms: ["TikTok", "Instagram Reels"],
    tone: "Bold, no-nonsense, results-driven"
  },
  {
    id: "queen_helene",
    name: "Queen Helene",
    category: "Personal care / beauty",
    voice: "Warm, accessible, trusted. Classic brand with modern energy. Speaks to everyday people who want affordable, effective personal care.",
    products: "Cocoa butter lotion, mint julep masque, facial masks, hair treatments",
    targetAudience: "Women 25-50, budget-conscious beauty consumers",
    platforms: ["TikTok", "Instagram Reels"],
    tone: "Friendly, relatable, trustworthy"
  },
  {
    id: "prell",
    name: "Prell",
    category: "Hair care",
    voice: "Clean, confident, no-nonsense. The original deep-clean shampoo. Speaks to people who are done with buildup and want their hair actually clean.",
    products: "Classic shampoo, concentrated formula, clarifying treatments",
    targetAudience: "Adults 25-55 who prioritize clean, healthy hair",
    platforms: ["TikTok", "Instagram Reels"],
    tone: "Direct, clean, confident"
  }
];

module.exports = brands;
```

---

## The 3 Pipelines

### Pipeline 1: Education
- **Purpose:** Authority content — tips, science, myth-busting
- **Image type:** PERSON — they become the on-screen presenter
- **Fields:** Topic (optional), Format (Talking head / 3 quick tips / Myth vs fact), Length (15s / 30s / 60s)
- **Video style:** Talking head, direct to camera, gym or clean studio setting
- **Brand mention:** Optional and natural only — never forced
- **CTA:** Save this / follow for more — no hard sell

### Pipeline 2: Comedy
- **Purpose:** Virality engine — skits, POV, relatable gym humor
- **Image type:** PERSON — they play the lead character
- **Fields:** Scenario (optional), Format (POV skit / Reaction / Character bit), Energy (Overconfident / Defeated / Shocked / Frustrated)
- **Video style:** Expressive, fast cuts, gym or everyday setting
- **Brand mention:** Background only — never the punchline

### Pipeline 3: Product
- **Purpose:** Conversion — UGC demo, before/after, results
- **Image type:** PRODUCT — becomes the visual hero of the video
- **Fields:** Product name (optional), Key benefit (optional), Format (UGC demo / Before-after / Result reveal / Unboxing), CTA (Link in bio / TikTok Shop / Comment for link)
- **Video style:** Authentic UGC, product clearly visible, not overproduced
- **Character:** Claude generates a relatable character (25-35, fitness enthusiast) to demo the product

---

## API Route Details

### POST /api/upload
- Accepts multipart form image
- Saves to /public/uploads/{timestamp}-{filename}
- Returns { imageUrl: "http://localhost:3000/uploads/..." }
- This URL is used for all subsequent steps AND for kie.ai (which needs a public URL)

### POST /api/analyze
Body: { imageUrl, pipeline, brand }
- Calls Claude with the image
- For PERSON pipelines (edu/comedy): analyze age range, gender presentation, build, hair, style, vibe, energy
- For PRODUCT pipeline: analyze product name/type, color, packaging, size, key visual features, text on packaging
- Returns { analysis: "..." }

### POST /api/script
Body: { analysis, pipeline, brand, fields }
- fields contains the pipeline-specific inputs (topic, format, length, scenario, energy, product, benefit, cta etc.)
- Calls Claude to generate the full TikTok script
- Returns { script: "..." } formatted as HOOK / BODY / CTA (or HOOK / SETUP / PUNCHLINE / TAG for comedy)

### POST /api/videoprompt
Body: { analysis, script, pipeline, brand, imageUrl }
- Calls Claude to generate a kie.ai-optimized video generation prompt
- For person pipelines: character must match the analyzed person exactly
- For product pipeline: product is the visual hero, generate a relatable UGC character to demo it
- Prompt must be under 1800 chars (kie.ai limit)
- Returns { videoPrompt: "..." }

### POST /api/generate
Body: { videoPrompt, imageUrl, kieApiKey (optional override) }
- Calls kie.ai POST https://api.kie.ai/api/v1/runway/generate
- Payload:
  ```json
  {
    "prompt": videoPrompt,
    "imageUrl": imageUrl,
    "model": "runway-duration-5-generate",
    "waterMark": "",
    "callBackUrl": "http://localhost:3000/api/callback"
  }
  ```
- Returns { taskId: "..." }

### GET /api/poll/:taskId
- Calls kie.ai GET https://api.kie.ai/api/v1/runway/record-detail?taskId={taskId}
- Auth: Bearer token
- Returns status: wait | queueing | generating | success | fail
- On success, returns { status: "success", videoUrl: "..." }
- Frontend polls this every 5 seconds until success or fail

### POST /api/callback
- kie.ai posts here when video is done
- Store result in memory keyed by taskId
- Frontend can also poll /api/result/:taskId

### POST /api/brands (optional)
- Save a new brand to the in-memory registry
- Body: { id, name, category, voice, products, targetAudience, tone }

---

## Frontend UI Requirements

### Layout
- Full-width dark theme (not black — dark charcoal, like #1a1a1a)
- Left sidebar: Brand selector + pipeline selector
- Main area: Two-column layout — LEFT: inputs + image upload, RIGHT: live step-by-step output

### Brand Selector (sidebar)
- Dropdown or card list of brands
- "+ Add Brand" button that opens a modal
- Modal fields: Name, Category, Voice/tone, Products, Target audience
- Selected brand context flows into every API call

### Pipeline Selector (sidebar)
- 3 cards: Education / Comedy / Product
- Each shows icon, name, description, and "Upload: person image" or "Upload: product image" hint
- Active pipeline highlighted

### Image Upload (left panel)
- Large drag-and-drop zone
- Shows preview after upload
- Calls /api/upload immediately on drop/select
- Stores returned imageUrl for all subsequent steps
- Label changes based on pipeline: "Upload person image" vs "Upload product image"

### Pipeline Fields (left panel)
- Show relevant fields based on active pipeline
- All optional — system auto-generates if blank

### Generate Button
- Single "Run pipeline →" button
- Triggers all 4 steps sequentially
- Disabled during run

### Output Panel (right side) — 4 steps shown live
Each step has:
- Step number + label
- Status indicator dot (grey → pulsing orange → green / red)
- Expandable content area that fills in as each step completes
- Copy button per step

**Step 1: Image Analysis**
- Shows the analysis text from Claude

**Step 2: Script**
- Shows the formatted script (HOOK / BODY / CTA etc.)
- Syntax-highlighted by section

**Step 3: Video Prompt**
- Shows the kie.ai prompt (monospace font)
- Character count shown (max 1800)

**Step 4: Video**
- Shows status: Queued → Generating → Ready
- Polls /api/poll/:taskId every 5 seconds automatically
- When done: shows video player inline (vertical 9:16)
- Download button

### Batch Mode (tab at top)
- Switch between "Single" and "Batch" tabs
- Batch: set counts per pipeline (edu / comedy / product), paste topics/scenarios/products one per line
- Queue shown as list of cards, each running through the same 4-step pipeline
- Progress bar across all jobs
- "Copy all scripts" button when done

---

## Claude Prompts (hardcode these in anthropic.js)

### Image Analysis — Person
```
You are a character analyst for TikTok video casting. Analyze the person in this image 
and return a concise, specific character description covering:
- Apparent age range
- Gender presentation  
- Physical build and height impression
- Hair (color, length, style)
- Clothing and style
- Overall vibe and energy (e.g. "gym bro confidence", "approachable fitness coach")
Be specific and factual. This is used to cast them as the lead in a TikTok video.
Output only the description, no preamble.
```

### Image Analysis — Product
```
You are a product analyst for TikTok UGC video creation. Analyze this product image and return:
- Product type and likely name
- Colors and packaging description
- Size/form factor
- Key visual features
- Any text visible on packaging
- Overall aesthetic (premium, drugstore, clinical, etc.)
Be specific and factual. This is used to create a UGC video prompt.
Output only the description, no preamble.
```

### Script — Education
```
System: You are a TikTok script writer for {brand.name} ({brand.category}). 
Brand voice: {brand.voice}. Target audience: {brand.targetAudience}.
Write punchy, direct scripts. Every word earns its place. No filler. No corporate language.

User: Character on screen: {analysis}

Write a {length} TikTok education script in {format} format.
Topic: {topic}

The character above is the on-screen presenter. Write to match their energy and vibe.

Structure:
HOOK (0-3s): Bold claim or surprising fact that stops the scroll
BODY: 3 punchy tips or one deep explanation — no filler
SOFT CTA: Save this / follow for more — no hard sell. Brand {brand.name} mention optional and natural only.

Format output exactly as:
HOOK: ...
BODY: ...
CTA: ...
```

### Script — Comedy
```
System: You are a TikTok comedy script writer. Relatable, self-aware gym humor. 
Not mean-spirited. Brand: {brand.name}. Voice: {brand.voice}.

User: Character: {analysis}

Write a 30s TikTok {format} skit.
Scenario: {scenario}
Character energy: {energy}

The character above plays the lead. Match their look and vibe in the action directions.

HOOK (0-2s): Visual or audio gag — stops scroll immediately
SETUP (2-15s): Establish the relatable situation fast
PUNCHLINE: Subvert the expectation
TAG: Optional second beat or reaction

Brand rule: Background placement only — never the punchline. Never forced.

Format exactly as:
HOOK: ...
SETUP: ...
PUNCHLINE: ...
TAG: ...
```

### Script — Product
```
System: You are a UGC TikTok script writer for {brand.name}. Voice: {brand.voice}.
Lead with the problem. Results do the talking. Authentic, not commercial.

User: Product analysis: {analysis}
Product name: {productName}
Key benefit: {benefit}

Write a TikTok UGC {format} script.
Generate a relatable 25-35 year old fitness enthusiast character to demo this product.

HOOK (0-3s): Lead with the PROBLEM — not the product
DEMO: Show the product working — describe the visual action
CTA: {cta}

Zero fluff. UGC aesthetic — real person, real result.

Format exactly as:
HOOK: ...
DEMO: ...
CTA: ...
```

### Video Prompt — Person Pipelines
```
System: You are a video generation prompt engineer for kie.ai / Runway. 
Write precise, cinematic prompts for vertical TikTok video. 
Always include: character description matching the reference image exactly, 
setting, action sequence, camera movement, lighting, editing pace, mood.
Output ONLY the prompt. No preamble. Max 1800 characters.

User: Reference character: {analysis}
Script: {script}
Pipeline: {pipeline} ({pipelineDescription})
Brand: {brand.name} — {brand.tone}

Write a kie.ai video generation prompt. The character in the reference image 
is the lead — describe them precisely so the AI matches their appearance.
Vertical 9:16, authentic TikTok style, not commercial.
```

### Video Prompt — Product Pipeline
```
System: You are a video generation prompt engineer for kie.ai / Runway.
Write precise, cinematic prompts for vertical TikTok UGC video.
Output ONLY the prompt. No preamble. Max 1800 characters.

User: Product: {analysis}
Script: {script}
Brand: {brand.name} — {brand.tone}

Write a kie.ai video generation prompt for a TikTok UGC product video.
The product is the visual hero — it must be clearly visible and in use.
Generate a relatable 25-35 fitness enthusiast character to demo it.
Authentic UGC feel — shot on phone, not a commercial.
Vertical 9:16.
```

---

## kie.ai Integration Notes
- Endpoint: POST https://api.kie.ai/api/v1/runway/generate
- Poll: GET https://api.kie.ai/api/v1/runway/record-detail?taskId={id}
- Auth header: Authorization: Bearer {KIEAI_API_KEY}
- Model: "runway-duration-5-generate" (5s video, fastest/cheapest for testing)
- imageUrl must be a publicly accessible URL — serve from /public/uploads
- callBackUrl: set to {BASE_URL}/api/callback
- Poll statuses: wait → queueing → generating → success | fail
- Poll every 5 seconds on the frontend
- Videos stored 14 days on kie.ai servers

---

## Key Behaviors
1. Image upload happens IMMEDIATELY on file select (before clicking Run)
2. The 4 steps run SEQUENTIALLY — each feeds into the next
3. Each step result is shown in the UI as soon as it completes
4. Polling starts automatically after step 4 kicks off
5. Brand context is passed with every single API call
6. All fields are optional — system auto-generates good defaults if blank
7. Adding a new brand via modal immediately makes it available in the selector
8. Switching brands or pipelines resets the output panel

---

## Error Handling
- If any step fails, show the error on that step's card with a retry button
- Retry should re-run from that step forward (not restart from step 1)
- If kie.ai returns "fail" status, show error with the raw response
- Log all API calls and responses to console for debugging

---

## To Run
```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
node server.js
# Open http://localhost:3000
```

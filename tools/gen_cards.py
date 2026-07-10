#!/usr/bin/env python3
"""Generate ~1000 Limen tile cards via DeepSeek (cheap bulk tier).
Validator is the gate: keyword whitelist, rarity power budgets, name dedupe.
Output: data/cards_gen.json. Rerunnable (tops up until TARGET unique cards).
"""
import json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen

TARGET = 1150
BATCH = 40
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "cards_gen.json")

KEYWORDS = {
    # keyword: power cost for the rarity budget
    # Round-1 meta retune: RALLY ran hot (57.0% @ 5288g) 1.5→2.0;
    # SCOUT ran cold (48.9% @ 5800g) 1.0→0.5. Round 2 adds WING/MENACE.
    "RALLY": 2.0, "SIEGE": 2.0, "SCOUT": 0.5, "FORTIFIED": 1.0,
    "DOUBLESTRIKE": 1.5, "ATTUNED": 1.0, "WARD": 1.5,
    "FLANK": 1.5, "SUSTAIN": 1.5, "TRAMPLE": 2.0, "UNTOUCHABLE": 1.0,
    "WING": 1.5, "MENACE": 1.5,
}
BUDGET = {"common": 3.0, "uncommon": 4.5, "rare": 6.0}
RARITY_MIX = "roughly 55% common, 30% uncommon, 15% rare"

SYSTEM = f"""You design tile cards for Limen, a hex-board influence duel between two realities \
(Verdant: lush crystalline nature; Umbral: dark obsidian arcana; plus the neutral magenta Rift).
Mechanics you may use (keyword: meaning):
RALLY +1 to adjacent friendlies | SIEGE enemies adjacent suffer -5 | SCOUT place anywhere outside enemy heartland \
| FORTIFIED +2 on board edges | DOUBLESTRIKE contributes twice to neighbors | ATTUNED +1 per adjacent rift hex \
| WARD blocks first capture | FLANK enemies capturable at <=1 with 2+ attackers | SUSTAIN +1 base per capture \
| TRAMPLE captures dent another adjacent enemy | UNTOUCHABLE immune to enemy rites \
| WING incoming enemy pressure halved | MENACE cannot be captured by fewer than 2 adjacent attackers.
Rules: influence 1-5. 0-2 keywords. Power budget = influence + keyword costs \
({json.dumps(KEYWORDS)}) must be <= {json.dumps(BUDGET)} for the card's rarity. {RARITY_MIX}.
Names: evocative, UPPERCASE, single word or hyphenated, unique, on-theme (nature/arcana/rift/war). \
Flavor: one short sentence, no quotes inside.
Reply ONLY with JSON: {{"cards":[{{"type":"NAME","influence":2,"rarity":"common","keywords":["RALLY"],"flavor":"..."}}]}}"""

def key():
    return subprocess.run(["slancha-op", "read", "op://Slancha/shared-ai-keys/DEEPSEEK_API_KEY"],
                          capture_output=True, text=True).stdout.strip() or \
           subprocess.run(["slancha-op", "read", "op://Slancha/slancha-studio/DEEPSEEK_API_KEY"],
                          capture_output=True, text=True).stdout.strip()

API_KEY = key()

def gen_batch(i):
    body = json.dumps({
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Generate {BATCH} cards. Batch #{i} — vary themes: "
             f"{['beasts','constructs','spirits','flora','warbands','rift anomalies','relics','elementals'][i % 8]}."},
        ],
        "response_format": {"type": "json_object"},
        "thinking": {"type": "disabled"},   # REQUIRED: thinking eats max_tokens otherwise
        "max_tokens": 4000,
        "temperature": 1.1,
    }).encode()
    req = Request("https://api.deepseek.com/chat/completions", data=body, headers={
        "Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"})
    try:
        d = json.load(urlopen(req, timeout=240))
        content = d["choices"][0]["message"]["content"]
        return json.loads(content).get("cards", [])
    except Exception as e:
        print(f"batch {i}: FAIL {str(e)[:100]}", flush=True)
        return []

def validate(card, seen):
    try:
        t = str(card["type"]).upper().replace(" ", "-")[:20]
        if not t or t in seen: return None
        inf = int(card["influence"])
        rar = card["rarity"]
        kws = [k for k in card.get("keywords", []) if k in KEYWORDS][:2]
        if rar not in BUDGET or not (1 <= inf <= 5): return None
        power = inf + sum(KEYWORDS[k] for k in kws)
        if power > BUDGET[rar]: return None   # reject overbudget (no silent clamp)
        if power < BUDGET[rar] - 2.5: return None  # reject strictly-worse chaff
        return {"type": t, "kind": "tile", "influence": inf, "rarity": rar,
                "keywords": kws, "flavor": str(card.get("flavor", ""))[:140]}
    except Exception:
        return None

def main():
    cards, seen = [], set()
    if os.path.exists(OUT):
        cards = json.load(open(OUT))
        seen = {c["type"] for c in cards}
        print(f"resuming with {len(cards)} existing", flush=True)
    batch_no = 0
    while len(cards) < TARGET and batch_no < 80:
        with ThreadPoolExecutor(max_workers=4) as ex:
            batches = list(ex.map(gen_batch, range(batch_no, batch_no + 4)))
        batch_no += 4
        kept = 0
        for b in batches:
            for c in b:
                v = validate(c, seen)
                if v:
                    seen.add(v["type"]); cards.append(v); kept += 1
        print(f"after batch {batch_no}: {len(cards)} cards (+{kept})", flush=True)
        json.dump(cards[:TARGET], open(OUT, "w"), indent=0)
    rar = {}
    for c in cards[:TARGET]: rar[c["rarity"]] = rar.get(c["rarity"], 0) + 1
    print(f"DONE {min(len(cards), TARGET)} cards {rar}", flush=True)

if __name__ == "__main__":
    main()

"""Read each Premier League player's senior clubs from his English Wikipedia
infobox and write data/wiki_clubs.tsv: name, wikipedia title, clubs.

Only clubs in fetch_wikidata_clubs.CLUBS count, and only spells that ran into
1992 or later. The Wikipedia title comes from the Wikidata match
(data/wikidata_clubs.tsv) where there is one, otherwise from a search.
"""
import csv, json, os, re, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from fetch_wikidata_clubs import CLUBS
from build_clubs import load_pl, norm, NICK

API = "https://en.wikipedia.org/w/api.php"
UA = "AlphabetGoalsDataBot/1.0 (https://github.com/chrisscaife/-alphabet-goals)"
ART = {a.lower(): c for c, a in CLUBS.items()}
ART.update({"brighton and hove albion f.c.": "Brighton", "wolverhampton wanderers": "Wolves",
            "bournemouth f.c.": "Bournemouth", "a.f.c. bournemouth": "Bournemouth", "qpr": "QPR"})

def api(params, tries=6):
    params = dict(params, format="json", formatversion="2")
    url = API + "?" + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print("retry", i, e, file=sys.stderr); time.sleep(5 * (i + 1))
    raise RuntimeError("api failed")

def infobox_clubs(text):
    """{club: True} for senior spells ending 1992 or later."""
    m = re.search(r"\{\{\s*Infobox football biography(.*?)\n\}\}", text, re.S | re.I)
    if not m:
        return None
    box = m.group(1)
    fields = dict((k.lower(), v) for k, v in re.findall(r"\|\s*([A-Za-z_]+\d*)\s*=\s*((?:[^|\[{]|\[\[[^\]]*\]\]|\{\{[^{}]*\}\}|[\[{])*)", box))
    out = set()
    for k, v in fields.items():
        mm = re.fullmatch(r"clubs(\d+)", k)
        if not mm:
            continue
        yrs = re.findall(r"(1[89]\d\d|20\d\d)", fields.get("years" + mm.group(1), ""))
        if yrs and int(yrs[-1]) < 1992 and not re.search(r"[–-]\s*$", fields.get("years" + mm.group(1), "").strip()):
            continue
        for link in re.findall(r"\[\[([^\]|#]+)", v):
            c = ART.get(link.strip().replace("_", " ").lower())
            if c:
                out.add(c)
    return out

def fetch_texts(titles):
    res = {}
    titles = list(titles)
    for i in range(0, len(titles), 50):
        d = api({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "redirects": 1, "titles": "|".join(titles[i:i + 50])})
        q = d.get("query", {})
        back = {}
        for r in q.get("redirects", []):
            back[r["to"]] = back.get(r["from"], r["from"])
        for n in q.get("normalized", []):
            back.setdefault(n["to"], n["from"])
        for p in q.get("pages", []):
            if "revisions" not in p:
                continue
            t = p["title"]
            txt = p["revisions"][0]["slots"]["main"]["content"]
            res[t] = txt
            src = t
            while src in back:
                src = back[src]; res[src] = txt
        time.sleep(0.5)
    return res

def main():
    pl = load_pl()
    titles = {}  # norm name -> wikipedia titles from Wikidata
    for r in csv.DictReader(open("data/wikidata_clubs.tsv", encoding="utf-8"), delimiter="\t"):
        if r["enwiki"]:
            for n in {r["name"], r["enwiki"]}:
                titles.setdefault(norm(n), set()).add(r["enwiki"])
    want = {}
    for row in pl:
        name = row[0]
        k = norm(name); t = k.split()
        c = set(titles.get(k, ()))
        if len(row) > 3 and row[3]:
            c |= titles.get(norm(row[3]), set())
        if not c and len(t) > 1 and NICK.get(t[0]):
            c = set(titles.get(" ".join([NICK[t[0]]] + t[1:]), ()))
        want[name] = c or {name, name + " (footballer)"}
    texts = fetch_texts(set().union(*want.values()))
    print("fetched", len(texts), file=sys.stderr)
    w = csv.writer(open("data/wiki_clubs.tsv", "w", newline="", encoding="utf-8"), delimiter="\t")
    w.writerow(["name", "title", "clubs"])
    found = searched = 0
    for row in pl:
        name = row[0]
        best = None
        for t in sorted(want[name]):
            cl = infobox_clubs(texts.get(t, ""))
            if cl:
                best = (t, best[1] | cl if best else cl)
        if not best:
            searched += 1
            d = api({"action": "query", "list": "search", "srsearch": name + " footballer Premier League", "srlimit": 5})
            hits = [h["title"] for h in d.get("query", {}).get("search", [])]
            tx = fetch_texts(hits)
            for h in hits:
                cl = infobox_clubs(tx.get(h, ""))
                if cl and (norm(h).split()[-1:] == norm(name).split()[-1:] or norm(name) in norm(h)):
                    best = (h, cl); break
        if best:
            found += 1
            w.writerow([name, best[0], ",".join(sorted(best[1]))])
    print(f"{found} of {len(pl)} found on Wikipedia ({searched} searched)", file=sys.stderr)

if __name__ == "__main__":
    main()

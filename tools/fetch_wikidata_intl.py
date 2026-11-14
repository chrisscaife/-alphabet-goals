"""Fetch senior men's international caps and goals from Wikidata (CC0).

Writes data/wikidata_intl.tsv with one row per player per national team:
qid, name, team_qid, team_label, caps, goals, positions, birth_year
"""
import csv, json, os, re, sys, time, urllib.parse, urllib.request

EP = "https://query.wikidata.org/sparql"
UA = "AlphabetGoalsDataBot/1.0 (https://github.com/chrisscaife/-alphabet-goals)"

def q(sparql, tries=5):
    data = urllib.parse.urlencode({"query": sparql, "format": "json"}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(EP, data=data, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:
            print("retry", i, e, file=sys.stderr); time.sleep(10 * (i + 1))
    raise RuntimeError("query failed")

TEAMS = """
SELECT DISTINCT ?t ?tl WHERE {
  ?t wdt:P31/wdt:P279* wd:Q6979593 .
  ?t rdfs:label ?tl FILTER(lang(?tl)="en")
}"""

BAD = re.compile(r"under|\bU-?\d|\bu\d\d|women|olympic|youth|amateur|\bB\b|futsal|beach|legends|\bXI\b|reserve|unofficial|universit|military|students|junior|cerebral|blind|amputee|deaf|veterans|masters|para|homeless|\bA'|second|military|police|regional|league", re.I)

PLAYERS = """
SELECT ?p ?pl ?caps ?goals ?birth (GROUP_CONCAT(DISTINCT ?posl; separator="/") AS ?pos) WHERE {
  ?p p:P54 ?st . ?st ps:P54 wd:%s .
  OPTIONAL { ?st pq:P1350 ?caps }
  OPTIONAL { ?st pq:P1351 ?goals }
  OPTIONAL { ?p wdt:P569 ?birth }
  OPTIONAL { ?p wdt:P413 ?posi . ?posi rdfs:label ?posl FILTER(lang(?posl)="en") }
  OPTIONAL { ?p rdfs:label ?pl FILTER(lang(?pl)="en") }
} GROUP BY ?p ?pl ?caps ?goals ?birth"""

def main():
    os.makedirs("data", exist_ok=True)
    teams = {}
    for b in q(TEAMS):
        lab = b["tl"]["value"]
        if BAD.search(lab):
            continue
        teams[b["t"]["value"].rsplit("/", 1)[1]] = lab
    print(len(teams), "teams", file=sys.stderr)
    out = open("data/wikidata_intl.tsv", "w", newline="", encoding="utf-8")
    w = csv.writer(out, delimiter="\t")
    w.writerow(["qid", "name", "team_qid", "team", "caps", "goals", "positions", "birth_year"])
    n = 0
    for i, (tq, tl) in enumerate(sorted(teams.items(), key=lambda x: x[1])):
        rows = q(PLAYERS % tq)
        for b in rows:
            g = lambda k: b[k]["value"] if k in b else ""
            by = g("birth")[:4]
            w.writerow([g("p").rsplit("/", 1)[1], g("pl"), tq, tl, g("caps"), g("goals"), g("pos"), by])
            n += 1
        print(i, tl, len(rows), file=sys.stderr)
        time.sleep(1)
    out.close()
    print("rows", n, file=sys.stderr)

if __name__ == "__main__":
    main()

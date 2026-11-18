"""Fetch club spells at every Premier League club from Wikidata (CC0).

Writes data/wikidata_clubs.tsv: qid, name, enwiki, club, start, end, birth_year
One row per spell (a player with two spells at a club gets two rows).
"""
import csv, json, os, sys, time, urllib.parse, urllib.request

EP = "https://query.wikidata.org/sparql"
UA = "AlphabetGoalsDataBot/1.0 (https://github.com/chrisscaife/-alphabet-goals)"

# Club name used in the game -> English Wikipedia article
CLUBS = {
    "Arsenal": "Arsenal F.C.", "Aston Villa": "Aston Villa F.C.", "Barnsley": "Barnsley F.C.",
    "Birmingham City": "Birmingham City F.C.", "Blackburn Rovers": "Blackburn Rovers F.C.",
    "Blackpool": "Blackpool F.C.", "Bolton Wanderers": "Bolton Wanderers F.C.", "Bournemouth": "AFC Bournemouth",
    "Bradford City": "Bradford City A.F.C.", "Brentford": "Brentford F.C.", "Brighton": "Brighton & Hove Albion F.C.",
    "Burnley": "Burnley F.C.", "Cardiff City": "Cardiff City F.C.", "Charlton Athletic": "Charlton Athletic F.C.",
    "Chelsea": "Chelsea F.C.", "Coventry City": "Coventry City F.C.", "Crystal Palace": "Crystal Palace F.C.",
    "Derby County": "Derby County F.C.", "Everton": "Everton F.C.", "Fulham": "Fulham F.C.",
    "Huddersfield Town": "Huddersfield Town A.F.C.", "Hull City": "Hull City A.F.C.", "Ipswich Town": "Ipswich Town F.C.",
    "Leeds United": "Leeds United F.C.", "Leicester City": "Leicester City F.C.", "Liverpool": "Liverpool F.C.",
    "Luton Town": "Luton Town F.C.", "Manchester City": "Manchester City F.C.", "Manchester United": "Manchester United F.C.",
    "Middlesbrough": "Middlesbrough F.C.", "Newcastle United": "Newcastle United F.C.", "Norwich City": "Norwich City F.C.",
    "Nottingham Forest": "Nottingham Forest F.C.", "Oldham Athletic": "Oldham Athletic A.F.C.", "Portsmouth": "Portsmouth F.C.",
    "QPR": "Queens Park Rangers F.C.", "Reading": "Reading F.C.", "Sheffield United": "Sheffield United F.C.",
    "Sheffield Wednesday": "Sheffield Wednesday F.C.", "Southampton": "Southampton F.C.", "Stoke City": "Stoke City F.C.",
    "Sunderland": "Sunderland A.F.C.", "Swansea City": "Swansea City A.F.C.", "Swindon Town": "Swindon Town F.C.",
    "Tottenham": "Tottenham Hotspur F.C.", "Watford": "Watford F.C.", "West Brom": "West Bromwich Albion F.C.",
    "West Ham": "West Ham United F.C.", "Wigan Athletic": "Wigan Athletic F.C.", "Wimbledon": "Wimbledon F.C.",
    "Wolves": "Wolverhampton Wanderers F.C.",
}

def q(sparql, tries=6):
    data = urllib.parse.urlencode({"query": sparql, "format": "json"}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(EP, data=data, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:
            print("retry", i, e, file=sys.stderr); time.sleep(15 * (i + 1))
    raise RuntimeError("query failed")

PLAYERS = """
SELECT ?p ?pl ?wt ?start ?end ?birth WHERE {
  <https://en.wikipedia.org/wiki/%s> schema:about ?club .
  ?p p:P54 ?st . ?st ps:P54 ?club .
  OPTIONAL { ?st pq:P580 ?start }
  OPTIONAL { ?st pq:P582 ?end }
  OPTIONAL { ?p wdt:P569 ?birth }
  OPTIONAL { ?p rdfs:label ?pl FILTER(lang(?pl)="en") }
  OPTIONAL { ?w schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?wt }
}"""

def main():
    os.makedirs("data", exist_ok=True)
    w = csv.writer(open("data/wikidata_clubs.tsv", "w", newline="", encoding="utf-8"), delimiter="\t")
    w.writerow(["qid", "name", "enwiki", "club", "start", "end", "birth_year"])
    for club, art in sorted(CLUBS.items()):
        rows = q(PLAYERS % urllib.parse.quote(art.replace(" ", "_"), safe="_.()&'"))
        if not rows:
            raise RuntimeError("no players for " + club)
        for b in rows:
            g = lambda k: b[k]["value"] if k in b else ""
            w.writerow([g("p").rsplit("/", 1)[1], g("pl"), g("wt"), club, g("start")[:4], g("end")[:4], g("birth")[:4]])
        print(club, len(rows), file=sys.stderr)
        time.sleep(2)

if __name__ == "__main__":
    main()

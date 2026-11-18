import sys
sys.path.insert(0, "tools")
from fetch_wikidata_clubs import q
for name in ["Rúben Neves", "Neal Maupay", "Ethan Pinnock", "Kevin Schade"]:
    rows = q('''SELECT ?p ?team ?tl ?start WHERE { ?p rdfs:label "%s"@en . ?p p:P54 ?st . ?st ps:P54 ?team .
      OPTIONAL{?st pq:P580 ?start} OPTIONAL{?team rdfs:label ?tl FILTER(lang(?tl)="en")} }''' % name)
    print(name, len(rows), [(r["p"]["value"][-10:], r["team"]["value"].rsplit("/",1)[1], r.get("tl",{}).get("value"), r.get("start",{}).get("value","")[:4]) for r in rows])
rows = q('SELECT ?c WHERE { <https://en.wikipedia.org/wiki/Wolverhampton_Wanderers_F.C.> schema:about ?c }')
print("wolves", rows)

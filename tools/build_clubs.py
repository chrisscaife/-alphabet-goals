"""Match Wikidata club spells (data/wikidata_clubs.tsv) to the Premier League
player list in docs/js/data.js and write docs/clubs.txt:

    Player Name|Club,Club,...

Only spells that ran into 1992 or later count. A player is matched on his
full name (or his Wikipedia title); failing that, on surname plus first
initial when that picks out exactly one Wikidata player at these clubs.

Usage: python tools/build_clubs.py
"""
import collections, csv, json, re, sys, unicodedata

def norm(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("ø", "o").replace("ł", "l").replace("ß", "ss").replace("æ", "ae").replace("ð", "d")
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"['’`.]", "", s).replace("-", " ")
    return " ".join(s.split())

# Shortened first names: Wikidata often uses the other form
NICK = {"andy": "andrew", "andrew": "andy", "tony": "anthony", "anthony": "tony", "mike": "michael", "michael": "mike",
        "dave": "david", "david": "dave", "steve": "steven", "steven": "steve", "stephen": "steve", "chris": "christopher",
        "christopher": "chris", "matt": "matthew", "matthew": "matt", "nick": "nicholas", "nicholas": "nick",
        "rob": "robert", "robert": "rob", "bobby": "robert", "jim": "james", "jimmy": "james", "james": "jamie",
        "jamie": "james", "dan": "daniel", "danny": "daniel", "daniel": "danny", "tom": "thomas", "tommy": "thomas",
        "thomas": "tom", "joe": "joseph", "joseph": "joe", "alex": "alexander", "alexander": "alex", "ben": "benjamin",
        "benjamin": "ben", "sam": "samuel", "samuel": "sam", "will": "william", "william": "will", "billy": "william",
        "phil": "philip", "philip": "phil", "phillip": "phil", "nicky": "nicholas", "ollie": "oliver", "oliver": "ollie",
        "jon": "jonathan", "jonathan": "jon", "jonny": "jonathan", "johnny": "john", "john": "johnny", "ian": "iain",
        "iain": "ian", "kenny": "kenneth", "tim": "timothy", "ed": "edward", "eddie": "edward", "ted": "edward",
        "gerry": "gerard", "jake": "jacob", "jacob": "jake", "zak": "zachary", "zach": "zachary", "pat": "patrick",
        "paddy": "patrick", "patrick": "pat", "ricky": "richard", "richard": "rick", "rick": "richard", "freddie": "frederick",
        "fred": "frederick", "harry": "henry", "charlie": "charles", "charles": "charlie", "greg": "gregory", "ron": "ronald",
        "ronnie": "ronald", "lenny": "leonard", "len": "leonard", "vinnie": "vincent", "nathan": "nat", "manny": "emmanuel",
        "emmanuel": "manny", "nico": "nicolas", "nicolas": "nico", "seb": "sebastian", "sebastian": "seb"}

def load_pl():
    src = open("docs/js/data.js", encoding="utf-8").read()
    m = re.search(r"const PL=(\[.*?\]);\s*\n", src, re.S)
    return json.loads(m.group(1))

def main():
    pl = load_pl()
    spells = collections.defaultdict(set)   # qid -> clubs
    names = collections.defaultdict(set)    # norm name -> qids
    by_last = collections.defaultdict(set)  # last word -> qids
    first_of = {}
    for r in csv.DictReader(open("data/wikidata_clubs.tsv", encoding="utf-8"), delimiter="\t"):
        st, en, by = r["start"], r["end"], r["birth_year"]
        if en and en.isdigit() and int(en) < 1992:
            continue
        if not en and not (st.isdigit() and int(st) >= 1985) and not (by.isdigit() and int(by) >= 1962):
            continue
        q = r["qid"]
        spells[q].add(r["club"])
        for n in {r["name"], r["enwiki"]}:
            k = norm(n)
            if not k:
                continue
            names[k].add(q)
            t = k.split()
            by_last[t[-1]].add(q)
            first_of.setdefault(q, set()).add(t[0])
    out, miss, amb = [], [], 0
    for row in pl:
        name, alias = row[0], (row[3] if len(row) > 3 else "")
        k = norm(name)
        qs = set(names.get(k, ()))
        if alias:
            qs |= names.get(norm(alias), set())
        t = k.split()
        if not qs and len(t) > 1:
            alt = NICK.get(t[0])
            if alt:
                qs = set(names.get(" ".join([alt] + t[1:]), ()))
        if not qs and len(t) > 1:
            c = [q for q in by_last.get(t[-1], ()) if any(f[0] == t[0][0] for f in first_of[q])]
            if len(c) == 1:
                qs = set(c)
            elif c:
                amb += 1
        if not qs:
            miss.append(name); continue
        clubs = set().union(*(spells[q] for q in qs))
        out.append(name + "|" + ",".join(sorted(clubs)))
    open("docs/clubs.txt", "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(f"{len(out)} of {len(pl)} matched; {len(miss)} unmatched ({amb} ambiguous)", file=sys.stderr)
    open("/tmp/clubs_missing.txt", "w").write("\n".join(miss))

if __name__ == "__main__":
    main()

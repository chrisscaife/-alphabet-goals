"""Merge the Wikidata snapshot (data/wikidata_intl.tsv) into docs/intl.txt.

Existing lines are kept. A player already listed (same name, or same name
words in another order, for the same country) gets the higher of the two
figures. Players not yet listed are added when Wikidata gives their caps
(and goals, for forwards) and a playing position.

Usage: python tools/build_intl.py
"""
import collections, csv, re, unicodedata

INTL = "docs/intl.txt"
SNAP = "data/wikidata_intl.tsv"
TMIDS = "data/intl_transfermarkt_ids.tsv"  # existing lines -> Transfermarkt player IDs

# Teams that are not senior men's national sides (B teams, regions, selections).
SKIP_TEAMS = {
    "Catalonia", "England national association football C team", "Turkey A2",
    "Russia-2", "Team 2006", "Italy Lega Pro representative teams", "Galicia",
    "Germany national football Α2 team", "Brittany", "Corsica", "FLN",
    "Wales national semi-professional", "Scotland national semi-professional",
    "Asturias autonomous", "Aragon", "Padania", "Andalusia autonomous", "Sealand",
    "Malaysia Pahang Sports School", "United Kingdom", "BIG Kurdistan",
    "Valencian Community autonomous", "Castile and León autonomous",
    "County of Nice", "Western Armenia", "Nagorno-Karabakh", "Abkhazia",
    "Shadhin Bangla Football Team", "Québec official soccer team",
    "Hong Kong Chinese official", "Åland Islands official",
    "Guernsey official", "Jersey official",
}

# Wikidata country -> the name already used in intl.txt
COUNTRY = {
    "Republic of Ireland": "Ireland", "Ireland": "Ireland (pre-1950)",
    "Turkey": "Türkiye", "South Korea": "Korea, South", "North Korea": "Korea, North",
    "Ivory Coast": "Cote d'Ivoire", "Bosnia and Herzegovina": "Bosnia-Herzegovina",
    "Czechia": "Czech Republic", "Hong Kong": "Hongkong", "Curaçao": "Curacao",
    "Saint Kitts and Nevis": "St. Kitts & Nevis",
    "Saint Vincent and the Grenadines": "St. Vincent & Grenadinen",
    "Canadian": "Canada", "Cuban": "Cuba", "Emirates": "United Arab Emirates",
}
# Spellings in the existing file treated as the same country when matching
SAME = {"South Korea": "Korea, South"}

SUFFIX = re.compile(r"\s+(men's\s+)?(national\s+)?(association\s+)?(football|soccer)(\s+team)?$|\s+(men's\s+)?national(\s+association)?\s+(football|soccer)\s+team$|\s+autonomous football team$|\s+official( association)? (football|soccer) team$", re.I)

FICTIONAL = {"Roy Race"}

# Wikidata writes these names family name first ("Lee Jae-sung"); the game,
# like the Transfermarkt lines, wants the family name last ("Jae-sung Lee").
CN = set("""wang li zhang liu chen yang huang zhao wu zhou xu sun ma zhu hu guo he gao lin luo
zheng liang xie song tang han feng deng cao peng zeng xiao tian dong yuan pan cai jiang yu du ye
cheng su wei lu ding ren shen yao jin fu zhong fan wang dai xia qiu hou shi bai qin xue yan lei
long duan hao kong shao mao wan gu lai wen qian niu tan ou xing hong yin chang kang qi gong jia
bian mei mo ji ai an bao bi chai che chu cui di diao fang ge geng guan hua ji jian jing ju kou
kuang lan lang leng lian liao ling mi miao min ning pang pei pu qu rao rong ruan sha shan shang
shu si tao teng tong tu wo xiang xin xiong yi yin you zang zhan zhuang zou zuo""".split())
HK = set("""chan cheung wong lee lam leung ho au chu lau yeung ng tsang kwok li lo fung tang law yip
cheang chow chau choi chung fong ip kwan kwong lai lui luk mak man mok pang poon sin siu so sze tam
cheng tse tsui tung wai wan wu yau yim yu yuen chiu ko hui kam kong koo kot lin liu lung ma shek shum
szeto tai to tong tsoi wing yan yee yung""".split())
VN = set("""nguyen tran le pham hoang huynh phan vu vo dang bui do ho ngo duong ly chu dinh mai luong
truong to doan lam ha trinh cao tang quach thai la ta kieu tieu""".split())

def western_order(name, country):
    t = name.split()
    if len(t) < 2:
        return name
    first = norm(t[0])
    if country in ("Korea, South", "Korea, North", "Chinese Taipei") and len(t) == 2 and "-" in t[1]:
        return f"{t[1]} {t[0]}"
    if (country == "China" and first in CN) or (country in ("Hongkong", "Macau") and first in HK) \
            or (country == "Vietnam" and first in VN):
        return " ".join(t[1:] + t[:1])
    return name

def country_of(team):
    c = SUFFIX.sub("", team).strip()
    c = re.sub(r"\s+(men's\s+)?national(\s+association)?$", "", c).strip()
    return COUNTRY.get(c, c)

def skip_team(team):
    return any(team.startswith(s) for s in SKIP_TEAMS)

def pos_of(labels):
    ls = [l.lower() for l in labels if l]
    if not ls:
        return ""
    fwd = any(re.search(r"forward|striker|winger|attacker|^wing$|left wing|offense", l) for l in ls)
    mid = any(re.search(r"midfield|wing half|playmaker|half-back", l) for l in ls)
    dfn = any(re.search(r"back|defender|sweeper|libero|stopper|centerhalf|centre half|defenseman", l) for l in ls)
    gk = any(re.search(r"goalkeeper$|goaltender", l) for l in ls)
    if fwd: return "F"
    if mid: return "M"
    if dfn: return "D"
    if gk: return "G"
    return ""

def norm(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return s.lower().replace("ø", "o").replace("ł", "l").replace("ß", "ss").strip()

def words(s):
    return " ".join(sorted(re.findall(r"[a-z0-9]+", norm(s))))

def same_person(a, b):
    """Two spellings of one name: same surname and first-name initial, or one
    name's words all inside the other's (e.g. Bhaudry Massouanga)."""
    ta, tb = re.findall(r"[a-z0-9']+", norm(a)), re.findall(r"[a-z0-9']+", norm(b))
    if not ta or not tb:
        return False
    if set(ta) <= set(tb) or set(tb) <= set(ta):
        return True
    return ta[-1] == tb[-1] and ta[0][0] == tb[0][0]

def main():
    lines = [l.rstrip("\n").split("|") for l in open(INTL, encoding="utf-8") if l.strip()]
    by_key = {}
    near = collections.defaultdict(list)  # (country, stat) -> names
    for i, (name, pos, stat, ctry) in enumerate(lines):
        c = SAME.get(ctry, ctry)
        by_key.setdefault((norm(name), c), i)
        by_key.setdefault((words(name), c), i)
        near[(c, stat)].append(name)

    # Transfermarkt IDs of players already listed, so Wikidata's copy of the
    # same player is recognised however his name is spelled
    tm = collections.defaultdict(list)
    ids_of = collections.defaultdict(set)
    line_of = {(norm(l[0]), l[3]): i for i, l in enumerate(lines)}
    for row in open(TMIDS, encoding="utf-8"):
        name, ctry, tid = row.rstrip("\n").split("\t")
        i = line_of.get((norm(name), ctry))
        if i is not None:
            tm[tid].append(i)
            ids_of[i].add(tid)

    # Collapse the snapshot to one figure per player per team
    best = {}
    for r in csv.DictReader(open(SNAP, encoding="utf-8"), delimiter="\t"):
        team = r["team"]
        if skip_team(team) or not r["name"] or not r["caps"]:
            continue
        try:
            caps = int(float(r["caps"]))
            goals = int(float(r["goals"])) if r["goals"] else None
        except ValueError:
            continue
        if caps <= 0 or caps > 200 or r["name"] in FICTIONAL:
            continue
        if goals is not None:
            born = int(r["birth_year"]) if r["birth_year"].isdigit() else 0
            # Wikidata sometimes has club or cap counts in the goals field
            if goals < 0 or goals > 130 or goals > caps * 1.5 or (born >= 1965 and caps >= 15 and goals >= 0.85 * caps):
                goals = None
        k = (r["qid"], r["team_qid"])
        old = best.get(k)
        if old is None or caps > old["caps"]:
            best[k] = dict(name=re.sub(r'\s*["“][^"”]*["”]\s*', " ", r["name"]).strip(), tm=r.get("transfermarkt_id", ""), country=country_of(team), caps=caps, goals=goals,
                           pos=pos_of(r["positions"].split("/")))

    added, updated = [], 0
    stats = collections.Counter()
    for p in best.values():
        if re.search(r"^Q\d+$", p["name"]):
            continue
        c = SAME.get(p["country"], p["country"])
        i = next((j for j in tm.get(p["tm"], []) if SAME.get(lines[j][3], lines[j][3]) == c), None)
        if i is None:
            i = by_key.get((norm(p["name"]), c))
        if i is None:
            i = by_key.get((words(p["name"]), c))
        if i is not None and p["tm"] and ids_of[i] and p["tm"] not in ids_of[i]:
            # Same name, different player (Transfermarkt IDs differ). The game
            # can only hold one of them, so keep whichever scores more.
            if p["pos"] and not (p["pos"] == "F" and p["goals"] is None):
                new = f"{p['goals']}ig" if p["pos"] == "F" else f"{p['caps']}caps"
                if int(re.match(r"\d+", new).group()) > int(re.match(r"\d+", lines[i][2]).group()):
                    lines[i] = [western_order(p["name"], p["country"]), p["pos"], new, p["country"]]; updated += 1
            continue
        if i is not None:
            name, pos, stat, ctry = lines[i]
            m = re.match(r"^(\d+)(caps|ig)$", stat)
            if not m:
                continue
            n, kind = int(m.group(1)), m.group(2)
            new = p["caps"] if kind == "caps" else p["goals"]
            if new is not None and n < new <= n * 2 + 10:  # bigger jumps are usually bad data
                lines[i][2] = f"{new}{kind}"; updated += 1
            continue
        if not p["pos"]:
            stats["no position"] += 1; continue
        if p["pos"] == "F":
            if p["goals"] is None:
                stats["forward without goals"] += 1; continue
            stat = f"{p['goals']}ig"
        else:
            stat = f"{p['caps']}caps"
        if any(same_person(p["name"], n) for n in near[(c, stat)]):
            stats["other spelling of a listed player"] += 1; continue
        near[(c, stat)].append(p["name"])
        key = (norm(p["name"]), c)
        if key in by_key:  # a same-name player in the same country was added already
            j = by_key[key]
            if int(re.match(r"\d+", lines[j][2]).group()) >= int(re.match(r"\d+", stat).group()):
                continue
            lines[j] = [western_order(p["name"], p["country"]), p["pos"], stat, p["country"]]
            continue
        p["name"] = western_order(p["name"], p["country"])
        lines.append([p["name"], p["pos"], stat, p["country"]])
        by_key[key] = len(lines) - 1
        by_key.setdefault((words(p["name"]), c), len(lines) - 1)
        added.append(p)

    lines.sort(key=lambda l: (norm(l[0]), l[3]))
    with open(INTL, "w", encoding="utf-8", newline="\n") as f:
        for l in lines:
            f.write("|".join(l) + "\n")
    print(f"added {len(added)}, raised {updated}, total {len(lines)}; skipped: {dict(stats)}")

if __name__ == "__main__":
    main()

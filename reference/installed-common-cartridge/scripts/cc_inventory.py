#!/usr/bin/env python3
"""
Common Cartridge (.imscc) inventory tool.

Extracts a Common Cartridge package, parses imsmanifest.xml, classifies every
item in the course tree, and prints a structured map plus a flags section.

Usage:
    python3 cc_inventory.py COURSE.imscc [--extract-to DIR] [--json]

Standard library only. Matches XML tags by local name, so it is tolerant of
CC version (1.0-1.3) and vendor namespace differences.
"""
import argparse, json, os, re, sys, tempfile, zipfile, html
import xml.etree.ElementTree as ET


def lname(tag):
    return tag.split('}')[-1]


def find_local(elem, name):
    return [c for c in elem.iter() if lname(c.tag) == name]


def child_local(elem, name):
    return [c for c in list(elem) if lname(c.tag) == name]


def strip_html(s):
    s = html.unescape(s or '')
    s = re.sub(r'<input[^>]*>', '', s)
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def oneline(s, n=160):
    s = strip_html(s)
    return (s[:n].rstrip() + '\u2026') if len(s) > n else s


def yt_or_link_in(txt):
    m = re.search(r'https?://(?:www\.)?(?:youtu\.be|youtube\.com)/[^\s"\'<>]+', txt or '')
    return m.group(0) if m else None


def extract(imscc_path, dest):
    with zipfile.ZipFile(imscc_path) as z:
        z.extractall(dest)
    return dest


def load_manifest(root_dir):
    mpath = os.path.join(root_dir, 'imsmanifest.xml')
    if not os.path.isfile(mpath):
        # maybe double-zipped or nested
        hits = []
        for dp, _, fns in os.walk(root_dir):
            if 'imsmanifest.xml' in fns:
                hits.append(dp)
        if not hits:
            sys.exit("ERROR: no imsmanifest.xml found — not a valid Common Cartridge.")
        root_dir = hits[0]
        mpath = os.path.join(root_dir, 'imsmanifest.xml')
    return ET.parse(mpath).getroot(), root_dir


def resource_files(root_dir, rid):
    """Return list of files under the resource's folder (if any)."""
    d = os.path.join(root_dir, rid)
    if os.path.isdir(d):
        return sorted(os.listdir(d)), d
    return [], d


def read_first(root_dir, rid, ext):
    files, d = resource_files(root_dir, rid)
    for f in files:
        if f.endswith(ext):
            with open(os.path.join(d, f), encoding='utf-8', errors='replace') as fh:
                return fh.read()
    return None


def classify(root_dir, rid, rtype, href, title):
    """Return dict describing a leaf item."""
    low = (title or '').lower()
    files, d = resource_files(root_dir, rid)
    info = {'title': title, 'ref': rid, 'raw_type': rtype, 'href': href}

    # Web link (and video-as-link)
    if rtype.startswith('imswl'):
        xml = read_first(root_dir, rid, '.xml') or ''
        m = re.search(r'url href="([^"]+)"', xml)
        url = m.group(1) if m else ''
        if url and not re.match(r'^https?://|^mailto:', url):
            url = 'https://' + url
        info['kind'] = 'video' if 'video' in low else 'link'
        info['url'] = url
        return info

    if rtype.startswith('imsdt'):
        xml = read_first(root_dir, rid, '.xml') or ''
        mt = re.search(r'<text[^>]*>(.*?)</text>', xml, re.S)
        info['kind'] = 'discussion'
        info['description'] = oneline(mt.group(1)) if mt else ''
        return info

    if rtype.startswith('imsqti') or '/assessment' in rtype:
        xml = read_first(root_dir, rid, '.xml') or ''
        info['kind'] = 'quiz'
        info['questions'] = len(re.findall(r'<item ident=', xml))
        return info

    hl = (href or '').lower()
    if rtype == 'webcontent' and hl.endswith(('.pdf', '.docx', '.doc', '.pptx',
                                              '.xlsx', '.png', '.jpg', '.jpeg', '.gif')):
        info['kind'] = 'file'
        info['filename'] = os.path.basename(href)
        return info

    # empty folder -> dropped embed
    if os.path.isdir(d) and not files:
        info['kind'] = 'missing_video' if 'video' in low else 'missing'
        return info

    htmlc = read_first(root_dir, rid, '.html')
    if htmlc is not None:
        pts = re.search(r'max-points"[^>]*value="([^"]+)"', htmlc)
        info['description'] = oneline(htmlc)
        embedded = yt_or_link_in(htmlc)
        if embedded:
            info['embedded_link'] = embedded
        if pts:
            info['kind'] = 'assignment'
            info['points'] = pts.group(1)
        else:
            info['kind'] = 'page'
        return info

    info['kind'] = 'other'
    return info


def build(root):
    # course title
    t = None
    for g in find_local(root, 'title'):
        strs = find_local(g, 'string')
        if strs and strs[0].text:
            t = strs[0].text
            break
    version = None
    for sv in find_local(root, 'schemaversion'):
        version = sv.text
        break
    return t or '(untitled)', version or '(unknown)'


def resource_map(root):
    res = {}
    dups = []
    resources = find_local(root, 'resources')
    scope = resources[0] if resources else root
    for r in [c for c in scope.iter() if lname(c.tag) == 'resource']:
        rid = r.get('identifier')
        entry = (r.get('type', ''), r.get('href', ''))
        if rid in res and res[rid] != entry:
            dups.append(rid)
        elif rid in res:
            dups.append(rid)
        res.setdefault(rid, entry)
    return res, dups


def walk_tree(item, depth, root_dir, res, nodes):
    for c in child_local(item, 'item'):
        titles = child_local(c, 'title')
        title = titles[0].text if titles and titles[0].text else '(untitled)'
        ref = c.get('identifierref')
        if ref:
            rtype, href = res.get(ref, ('MISSING', ''))
            leaf = classify(root_dir, ref, rtype, href, title)
            leaf['depth'] = depth
            nodes.append(('item', leaf))
        else:
            nodes.append(('group', {'title': title, 'depth': depth}))
            walk_tree(c, depth + 1, root_dir, res, nodes)


TAG = {'link': 'Link', 'video': 'Video', 'discussion': 'Discussion',
       'quiz': 'Quiz', 'file': 'File', 'assignment': 'Assignment',
       'page': 'Page', 'missing_video': 'Video', 'missing': 'Item',
       'other': 'Item'}


def render_line(n):
    k = n['kind']
    tag = TAG.get(k, 'Item')
    title = n['title']
    if k in ('link', 'video') and n.get('url'):
        return f"- *{tag}* — [{title}]({n['url']})"
    if k in ('missing_video', 'missing'):
        return f"- *{tag}* — {title} — [!] link/content not in export"
    if k == 'quiz':
        return f"- *Quiz* — {title} ({n.get('questions', '?')} questions)"
    if k == 'file':
        return f"- *File* — {n.get('filename', title)}"
    if k == 'assignment':
        d = n.get('description') or ''
        head = f"- *Assignment* ({n.get('points','?')} pts) — {title}"
        line = head + (f": {d}" if d else " (no instructions in export)")
        if n.get('embedded_link'):
            line += f"\n    embedded link: {n['embedded_link']}"
        return line
    if k in ('page', 'discussion'):
        d = n.get('description') or ''
        line = f"- *{tag}* — {title}" + (f": {d}" if d else "")
        if n.get('embedded_link'):
            line += f"\n    embedded link: {n['embedded_link']}"
        return line
    return f"- *Item* — {title}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('imscc')
    ap.add_argument('--extract-to', default=None,
                    help='keep extracted files here (default: temp dir)')
    ap.add_argument('--json', action='store_true', help='emit JSON instead of text map')
    args = ap.parse_args()

    dest = args.extract_to or tempfile.mkdtemp(prefix='imscc_')
    os.makedirs(dest, exist_ok=True)
    extract(args.imscc, dest)
    root, root_dir = load_manifest(dest)

    title, version = build(root)
    res, dups = resource_map(root)

    orgs = find_local(root, 'organization')
    nodes = []
    if orgs:
        top = child_local(orgs[0], 'item')
        start = top[0] if top else orgs[0]
        walk_tree(start, 0, root_dir, res, nodes)

    # tallies + flags
    counts = {}
    missing, embedded, files = [], [], []
    for kind_, n in nodes:
        if kind_ != 'item':
            continue
        counts[n['kind']] = counts.get(n['kind'], 0) + 1
        if n['kind'] in ('missing_video', 'missing'):
            missing.append(n['title'])
        if n.get('embedded_link'):
            embedded.append((n['title'], n['embedded_link']))
        if n['kind'] == 'file':
            files.append(n.get('filename', n['title']))
    broken = [rid for rid, (ty, hr) in res.items() if hr.startswith('/')]

    if args.json:
        out = {
            'title': title, 'cc_version': version,
            'counts': counts,
            'flags': {'dropped_embeds': missing, 'embedded_links': embedded,
                      'duplicate_resources': sorted(set(dups)),
                      'broken_absolute_hrefs': broken},
            'tree': [{'type': t, **n} for t, n in nodes],
        }
        print(json.dumps(out, indent=2, ensure_ascii=False))
        return

    print(f"COURSE: {title}")
    print(f"CC VERSION: {version}")
    print(f"EXTRACTED TO: {root_dir}")
    print()
    print("=== CONTENT INVENTORY ===")
    for k in sorted(counts, key=lambda x: -counts[x]):
        print(f"  {counts[k]:3d}  {TAG.get(k,k)}" + (" (dropped/empty)" if 'missing' in k else ""))
    print(f"  ---  {sum(counts.values())} items total")
    print()
    print("=== FLAGS ===")
    print(f"  Dropped embeds (no URL/content in export): {len(missing)}")
    for m in missing:
        print(f"      - {m}")
    if embedded:
        print(f"  Links embedded inside content (easy to miss): {len(embedded)}")
        for tt, u in embedded:
            print(f"      - {tt}: {u}")
    if dups:
        print(f"  Duplicate resource identifiers: {sorted(set(dups))}")
    if broken:
        print(f"  Broken absolute hrefs (export artifacts): {len(broken)}")
    if not (missing or embedded or dups or broken):
        print("  none detected")
    print()
    print("=== COURSE TREE ===")
    for t, n in nodes:
        if t == 'group':
            print()
            print('#' * min(n['depth'] + 1, 6) + ' ' + n['title'])
        else:
            indent = '  '
            print(indent + render_line(n).replace('\n', '\n' + indent))


if __name__ == '__main__':
    main()

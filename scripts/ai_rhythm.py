"""Render the public AI Rhythm README card from allowlisted AI Field counters.

Usage: python scripts/ai_rhythm.py --fetch
       python scripts/ai_rhythm.py --input /path/to/public-snapshot.json
No provider credentials or local session files are read by this script.
"""
import argparse
import datetime as dt
import html
import json
import math
from pathlib import Path
import time
import urllib.request
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://ai.artursafonov.me/data.json'
TZ = ZoneInfo('Europe/Kyiv')
COLORS = dict(bg='#0d1122', line='#27304b', text='#dce3fa', muted='#a4aecb',
              dim='#7e8aa9', green='#c5f881', blue='#7aa2f7',
              violet='#bb9af7', gold='#f7d794')


def moment(value):
    if not isinstance(value, str):
        raise ValueError('Missing timestamp')
    result = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Timestamp requires timezone')
    return result


def count(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError('Invalid numeric counter')
    return value


def allowlist(raw):
    """Never persist arbitrary source keys, model text, paths, or account data."""
    if raw.get('version') != 2:
        raise ValueError('Unsupported AI Field snapshot')
    start, end = (dt.date.fromisoformat(raw[key]) for key in ('start', 'end'))
    if (end-start).days != 29:
        raise ValueError('Expected a 30-day period')
    daily = raw['daily']
    if len(daily) != 30 or [row['day'] for row in daily] != [(start+dt.timedelta(days=i)).isoformat() for i in range(30)]:
        raise ValueError('Daily history is incomplete or duplicated')
    totals = {key: sum(count(row[key]) for row in daily) for key in ('input', 'output', 'calls')}
    active = sum(bool(row['input'] or row['output'] or row['calls']) for row in daily)
    calendar = []
    previous = None
    for row in raw['calendar']:
        day = dt.date.fromisoformat(row['day'])
        if day > end or (previous is not None and day <= previous):
            raise ValueError('Invalid calendar order')
        calendar.append(dict(day=day.isoformat(), calls=count(row['calls'])))
        previous = day
    if not calendar or len(calendar) > 366:
        raise ValueError('Invalid calendar history')
    usage_timestamp = raw['sources']['usage']['timestamp']
    moment(usage_timestamp)
    quotas = {}
    for provider in ('Codex', 'Claude', 'Grok'):
        points = raw.get('quotaHistory', {}).get(provider, {}).get('points', [])
        health = raw.get('sources', {}).get('quotas', {}).get(provider, {})
        if not points:
            quotas[provider] = dict(used=None, timestamp=None, ok=False)
            continue
        last = max(points, key=lambda p: moment(p['timestamp']))
        used = count(last['used'])
        if used > 100:
            raise ValueError('Invalid quota percentage')
        quotas[provider] = dict(used=used, timestamp=last['timestamp'], ok=health.get('ok') is True)
    return dict(version=1, start=start.isoformat(), end=end.isoformat(),
                usageTimestamp=usage_timestamp, usageOk=raw['sources']['usage'].get('ok') is True,
                totals=totals, activeDays=active, calendar=calendar, quotas=quotas)


def compact(value):
    for divisor, suffix in ((1e9, 'B'), (1e6, 'M'), (1e3, 'K')):
        if value >= divisor:
            return f'{value/divisor:.2f}'.rstrip('0').rstrip('.')+suffix
    return str(value)


def render(data, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    updated = moment(data['usageTimestamp']).astimezone(TZ)
    usage_stale = (now-updated).total_seconds() > 10800 or not data['usageOk']
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="668" viewBox="0 0 1200 668" role="img" aria-labelledby="title desc">',
             '<title id="title">AI Rhythm — personal agent activity</title>',
             '<desc id="desc">Observed token and client tool counters for the last 30 days, calendar activity, and latest weekly quota used percentages. Missing readings are not zero; old or failed sources are labelled.</desc>',
             '<defs><linearGradient id="topline"><stop stop-color="#c5f881"/><stop offset=".6" stop-color="#7aa2f7"/><stop offset="1" stop-color="#bb9af7"/></linearGradient><clipPath id="frame"><rect x=".5" y=".5" width="1199" height="667" rx="22"/></clipPath></defs>',
             "<style>text{font-family:'Segoe UI',Arial,sans-serif}.mono{font-family:'Cascadia Code',Consolas,monospace}.label{font-size:13px;letter-spacing:1.8px;font-weight:600}.small{font-size:14px}.body{font-size:16px}.num{font-size:46px;font-weight:650;letter-spacing:-1.8px;font-variant-numeric:tabular-nums}</style>",
             '<rect x=".5" y=".5" width="1199" height="667" rx="22" fill="#0d1122" stroke="#27304b"/>',
             '<path d="M24 .5H1176" stroke="url(#topline)" stroke-width="3" clip-path="url(#frame)"/>']

    def text(x, y, value, cls='body', color=None, extra=''):
        parts.append(f'<text x="{x}" y="{y}" class="{cls}" fill="{color or COLORS["text"]}" {extra}>{html.escape(str(value))}</text>')

    def rect(x, y, w, h, color, rx=4, extra=''):
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{color}" {extra}/>')

    def line(x1, y1, x2, y2):
        parts.append(f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{COLORS["line"]}"/>')

    text(40, 40, 'HUMAN INTENT / AGENT ACTIVITY', 'label', COLORS['dim'])
    text(40, 94, 'AI Rhythm', '', extra='font-size="40" font-weight="700" letter-spacing="-1.5"')
    text(40, 124, 'The work between the commits.', 'body', COLORS['muted'])
    parts.append(f'<circle cx="930" cy="39" r="4" fill="{COLORS["gold"] if usage_stale else COLORS["green"]}"/>')
    text(944, 44, 'DATA FROM MY WORKFLOWS', 'label', COLORS['muted'])
    text(1160, 91, 'LAST 30 DAYS', 'label', COLORS['green'], 'text-anchor="end"')
    first, last = (dt.date.fromisoformat(data[key]) for key in ('start', 'end'))
    text(1160, 119, f'{first:%b %d} – {last:%b %d, %Y}', 'small mono', COLORS['muted'], 'text-anchor="end"')
    for x, value, label, color in ((40, compact(data['totals']['input']+data['totals']['output']), 'PROCESSED TOKENS', 'green'),
                                   (400, f'{data["totals"]["calls"]:,}', 'TOOL CALLS', 'blue'),
                                   (810, f'{data["activeDays"]} / 30', 'ACTIVE DAYS', 'violet')):
        text(x, 200, value, 'num', COLORS[color])
        text(x, 230, label, 'label', COLORS['muted'])
    line(354, 161, 354, 234)
    line(758, 161, 758, 234)
    line(40, 263, 1160, 263)
    text(40, 300, 'THE DAILY RHYTHM', 'label')
    text(760, 300, 'WEEKLY QUOTA USED', 'label')
    text(760, 326, 'Latest observed reading · Kyiv time', 'small', COLORS['muted'])

    # At most 26 weeks so the README card never overflows as history grows.
    recorded_first = dt.date.fromisoformat(data['calendar'][0]['day'])
    monday = last-dt.timedelta(days=last.weekday())
    visible_first = max(recorded_first, monday-dt.timedelta(weeks=25))
    rows = {r['day']: r for r in data['calendar'] if visible_first.isoformat() <= r['day'] <= last.isoformat()}
    grid_first = visible_first-dt.timedelta(days=visible_first.weekday())
    grid_last = last+dt.timedelta(days=6-last.weekday())
    active = sum(row['calls'] > 0 for row in rows.values())
    text(40, 326, f'{active} active days · {visible_first.isoformat()} → {last.isoformat()}', 'small', COLORS['muted'])
    levels = ['#192039', '#314c40', '#5d844f', '#8eba66', '#c5f881']
    for weekday, label in ((0, 'M'), (2, 'W'), (4, 'F')):
        text(45, 378+weekday*23, label, 'small mono', COLORS['dim'])
    for index in range((grid_last-grid_first).days+1):
        day = grid_first+dt.timedelta(days=index)
        x, y = 78+(index//7)*23, 365+day.weekday()*23
        if day >= visible_first and (day.day == 1 or day == visible_first):
            text(x, 352, day.strftime('%b'), 'small mono', COLORS['dim'])
        row = rows.get(day.isoformat())
        if row is None:
            rect(x, y, 17, 17, COLORS['bg'], extra='stroke="#27304b" stroke-dasharray="2 3"')
            continue
        value = row['calls']
        level = 0 if value == 0 else 1+sum(value > threshold for threshold in (100, 400, 1000))
        parts.append(f'<g><title>{day.isoformat()}: {value:,} observed tool calls</title>')
        rect(x, y, 17, 17, levels[level])
        parts.append('</g>')
    text(40, 554, 'TOOL CALLS / DAY', 'label', COLORS['dim'])
    for index, (color, label) in enumerate(zip(levels, ('0', '1–100', '101–400', '401–1K', '>1K'))):
        x = 239+index*86
        rect(x, 541, 12, 12, color, 3)
        text(x+18, 552, label, '', COLORS['muted'], 'font-size="12"')

    line(718, 290, 718, 556)
    for index, (provider, color) in enumerate((('Codex', 'green'), ('Claude', 'violet'), ('Grok', 'gold'))):
        row, y = data['quotas'][provider], 365+index*68
        text(760, y, provider, 'body', extra='font-weight="600"')
        text(1000, y, '—' if row['used'] is None else f'{row["used"]:g}%', 'body mono', COLORS[color], 'text-anchor="end" font-weight="700"')
        rect(760, y+13, 400, 7, '#20283e', 3.5)
        if row['used']:
            rect(760, y+13, row['used']*4, 7, COLORS[color], 3.5)
        if row['timestamp']:
            stamp = moment(row['timestamp']).astimezone(TZ)
            stale = (now-stamp).total_seconds() > 10800
            label = stamp.strftime('%H:%M') if stamp.date() == now.astimezone(TZ).date() else stamp.strftime('%b %d %H:%M')
            text(1160, y, label, 'small mono', COLORS['dim'], 'text-anchor="end"')
            if stale or not row['ok']:
                status = 'Last known reading · source unavailable' if not row['ok'] else 'Last known reading · over 3h old'
                text(760, y+41, status, '', COLORS['gold'], 'font-size="12"')
        else:
            text(760, y+41, 'No quota reading available', '', COLORS['dim'], 'font-size="12"')
    text(760, 554, 'A snapshot of limits, separate from token usage.', '', COLORS['muted'], 'font-size="13"')
    line(40, 583, 1160, 583)
    text(40, 613, 'Codex as the harness. Claude Code alongside.', 'body', extra='font-weight="600"')
    text(40, 640, f'Input includes cache · output includes reasoning · tokens {updated:%b %d, %H:%M} Kyiv'+(' · stale' if usage_stale else ''), '', COLORS['dim'], 'font-size="12"')
    text(1160, 620, 'EXPLORE AI FIELD ↗', 'label', COLORS['green'], 'text-anchor="end"')
    return ''.join(parts)+'</svg>'


def fetch_snapshot():
    request = urllib.request.Request(SOURCE, headers={'User-Agent': 'artur-safonov-ai-rhythm/1.0', 'Accept': 'application/json', 'Cache-Control': 'no-cache'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                body = response.read(8_000_001)
            if len(body) > 8_000_000:
                raise ValueError('Oversized snapshot')
            return json.loads(body)
        except (OSError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(2*(attempt+1))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--fetch', action='store_true')
    source.add_argument('--input', type=Path)
    args = parser.parse_args()
    raw = fetch_snapshot() if args.fetch else json.loads(args.input.read_text(encoding='utf-8-sig'))
    data = allowlist(raw)
    target = ROOT/'data/ai-rhythm.json'
    if target.exists():
        previous = json.loads(target.read_text(encoding='utf-8'))
        if moment(data['usageTimestamp']) < moment(previous['usageTimestamp']):
            raise ValueError('Refusing to replace token counters with an older snapshot')
    svg = render(data)
    target.parent.mkdir(parents=True, exist_ok=True)
    (ROOT/'assets').mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (ROOT/'assets/ai-rhythm.svg').write_text(svg+'\n', encoding='utf-8')
    print(f'AI Rhythm updated: tokens {data["usageTimestamp"]}; source contains only numeric aggregates.')


if __name__ == '__main__':
    main()

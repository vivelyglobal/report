#!/usr/bin/env python3
"""Collect public reel metadata without changing the seven-column KOL sheet.

Usage: python3 scripts/enrich_reels.py --sheet SHEET_ID --gid 0
Output: reel-insights.js. Existing reviewer-authored analysis is never generated
or replaced by this collector. Instagram access failures remain explicit.
"""
import argparse
import csv
import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def canonical_url(value):
    try:
        url = urllib.parse.urlsplit(value.strip())
        match = re.fullmatch(r'/(?:reel|reels|p)/([A-Za-z0-9_-]+)/?', url.path)
        if url.scheme not in ('https', 'http') or url.hostname not in ('instagram.com', 'www.instagram.com') or not match:
            return None
        kind = 'p' if url.path.startswith('/p/') else 'reel'
        return f'https://www.instagram.com/{kind}/{match[1]}/'
    except ValueError:
        return None


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}
        self.in_json = False
        self.json_text = ''
        self.json_blocks = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            name = attrs.get('property', attrs.get('name', ''))
            self.meta[name] = attrs.get('content', '')
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.in_json = True
            self.json_text = ''

    def handle_data(self, data):
        if self.in_json:
            self.json_text += data

    def handle_endtag(self, tag):
        if tag == 'script' and self.in_json:
            self.in_json = False
            try:
                self.json_blocks.append(json.loads(self.json_text))
            except ValueError:
                pass


def caption_from_json(value):
    if isinstance(value, dict):
        for key in ('articleBody', 'caption'):
            if isinstance(value.get(key), str) and value[key].strip():
                return value[key].strip()
        for child in value.values():
            result = caption_from_json(child)
            if result:
                return result
    if isinstance(value, list):
        for child in value:
            result = caption_from_json(child)
            if result:
                return result
    return ''


def caption_from_description(description):
    # English/Arabic Instagram metadata and the Japanese quoted-caption variant.
    match = re.search(r':\s*"([\s\S]*)"\.\s*[\u200e\u200f]*$', description)
    if not match:
        match = re.match(r'^「([\s\S]*)」\s*-', description)
    return match.group(1).strip() if match else ''


def fetch_text(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; VivelyReportMetadata/1.0)'})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read(8_000_000).decode('utf-8', errors='replace')


def collect(url):
    record = {'post_url': url, 'checked_at': datetime.now(timezone.utc).isoformat(),
              'status': 'unavailable', 'caption': '', 'hashtags': [], 'metadata_excerpt': '',
              'video_reviewed': False}
    try:
        parser = Metadata()
        parser.feed(fetch_text(url))
        caption = caption_from_json(parser.json_blocks)
        structured_caption = bool(caption)
        excerpt = parser.meta.get('og:description', '') or parser.meta.get('description', '')
        if not caption:
            caption = caption_from_description(excerpt)
        record['caption_source'] = 'structured_data' if structured_caption else 'og:description'
        record['caption_is_excerpt'] = not structured_caption
        record['metadata_excerpt'] = excerpt
        record['caption'] = caption
        record['hashtags'] = sorted(set(re.findall(r'#[\w]+', caption, re.UNICODE)))
        record['status'] = 'caption_collected' if caption else 'metadata_only' if excerpt and parser.meta.get('og:type') in ('video', 'video.other', 'article', 'instapp:photo') else 'unavailable'
        if record['status'] == 'unavailable':
            record['reason'] = 'Public post metadata was not available; login or manual review may be required.'
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        record['reason'] = str(error)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sheet', required=True)
    parser.add_argument('--gid', default='0')
    parser.add_argument('--delay', type=float, default=2.0)
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]+', args.sheet) or not args.gid.isdigit() or args.delay < 0:
        parser.error('Invalid sheet ID, gid or delay')
    sheet_url = f'https://docs.google.com/spreadsheets/d/{args.sheet}/export?format=csv&gid={args.gid}'
    sheet_rows = list(csv.DictReader(io.StringIO(fetch_text(sheet_url))))
    if sheet_rows and 'post_url' not in sheet_rows[0]:
        parser.error('The sheet requires a post_url header')
    urls = list(dict.fromkeys(url for row in sheet_rows if (url := canonical_url(row.get('post_url', '')))))
    records = []
    for index, url in enumerate(urls):
        record = collect(url)
        records.append(record)
        print(f'{index + 1}/{len(urls)} {url} {record["status"]}', flush=True)
        if index + 1 < len(urls):
            time.sleep(args.delay)
    # Collection and human review live in separate files so refreshes cannot erase review.
    payload = {'sheet': args.sheet, 'gid': args.gid, 'posts': records}
    output = ROOT / 'reel-insights.js'
    campaigns = []
    if output.exists():
        old = output.read_text(encoding='utf-8')
        existing = json.loads(old[old.index('{'):].strip().removesuffix(';'))
        campaigns = existing.get('campaigns', [existing])
    campaigns = [c for c in campaigns if (c.get('sheet'), str(c.get('gid'))) != (args.sheet, args.gid)]
    campaigns.append(payload)
    encoded = json.dumps({'campaigns': campaigns}, ensure_ascii=False, indent=2).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    (ROOT / 'reel-insights.js').write_text('window.VIVELY_REEL_INSIGHTS = ' + encoded + ';\n', encoding='utf-8')
    print('Saved reel-insights.js. Captions/metadata are evidence only; video and performance hypotheses require review.')


if __name__ == '__main__':
    main()

"""Fetch the approved recordings, preserving original MP3 bytes and provenance.

    python3 .github/scripts/fetch_music.py
    python3 .github/scripts/fetch_music.py --check  # offline integrity check
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
RECEIPTS = ROOT / 'assets/audio/music/sources.json'


def catalog():
    script = """
const fs = require('node:fs'), vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync('js/music.js', 'utf8'), context);
process.stdout.write(JSON.stringify(context.window.MusicLibrary.tracks));
"""
    return json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT))


def download(track):
    if not re.fullmatch(r'[a-z0-9-]+', track['id']):
        raise ValueError('Invalid music ID')
    dest = ROOT / track['src']
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file():
        data = dest.read_bytes()
    else:
        error = None
        for _ in range(2):
            try:
                request = urllib.request.Request(track['download'], headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; HomepageMusicDownload/1.0)',
                    'Referer': track['source'],
                })
                with urllib.request.urlopen(request, timeout=40) as response:
                    data = response.read()
                if len(data) < 10000 or data.lstrip().startswith((b'<!', b'<html')):
                    raise ValueError('Expected an MP3 recording, received an error page')
                dest.write_bytes(data)
                error = None
                break
            except Exception as exc:
                error = exc
        if error:
            raise RuntimeError(f"{track['id']}: {error}")
    print(f"{track['id']}: {len(data) / 1048576:.2f} MiB", flush=True)
    return {
        'id': track['id'], 'file': track['src'], 'title': track['title'],
        'artist': track['artist'], 'license': track['license'],
        'licenseUrl': track['licenseUrl'], 'source': track['source'],
        'download': track['download'], 'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
        'retrieved': datetime.date.today().isoformat(),
        'changes': 'Original MP3 download; no editing or transcoding by this site.',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    tracks = catalog()
    if args.check:
        records = json.loads(RECEIPTS.read_text())
        assert {item['id'] for item in records} == set(tracks), 'Incomplete music provenance'
        for item in records:
            data = (ROOT / item['file']).read_bytes()
            assert len(data) == item['bytes'], item['id'] + ': incorrect size'
            assert hashlib.sha256(data).hexdigest() == item['sha256'], item['id'] + ': incorrect checksum'
        print(f'Validated {len(records)} original recordings and checksums.')
        return
    records, errors = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(download, track) for track in tracks.values()]
        for future in concurrent.futures.as_completed(futures):
            try:
                records.append(future.result())
            except Exception as error:
                errors.append(str(error))
                print(str(error), flush=True)
    if errors:
        raise SystemExit('Some recordings failed; rerun to retry missing files.')
    RECEIPTS.write_text(json.dumps(sorted(records, key=lambda row: row['id']), ensure_ascii=False, indent=2) + '\n')
    print(f'Saved {len(records)} recordings and provenance to {RECEIPTS.relative_to(ROOT)}.')


if __name__ == '__main__':
    main()

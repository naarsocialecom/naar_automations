"""
Home page (/): every dashboard and automation as a card with a thumbnail of its page.
Cards come from each module's CARD (modules listed in web/modules.py). Thumbnails are real
screenshots taken in the background and kept for THUMB_MAX_AGE; the page shows an illustration
until the first one is ready.
"""
import fcntl
import importlib
import io
import logging
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional

from flask import Blueprint, abort, jsonify, render_template, send_file

from web import scheduler
from web.config import Config
from web.modules import MODULES

logger = logging.getLogger(__name__)

home_bp = Blueprint('home', __name__)

THUMB_DIR = Config.DATA_DIR / 'thumbnails'
THUMB_MAX_AGE = 60 * 60          # refresh each thumbnail once an hour
THUMB_WIDTH = 720


def cards() -> List[Dict]:
    out = []
    for module in MODULES:
        card = getattr(importlib.import_module(module), 'CARD', None)
        if card:
            out.append(card)
    return out


def _card(card_id: str) -> Optional[Dict]:
    return next((c for c in cards() if c['id'] == card_id), None)


def _thumb_path(card_id: str) -> Path:
    return THUMB_DIR / f'{card_id}.jpg'


def _make_thumbnail(card: Dict) -> None:
    """Screenshot the card's page and save a small JPEG. One browser at a time (file locks)."""
    from PIL import Image
    from web.shared.page_snapshot import SnapshotError, capture_page
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    with open(THUMB_DIR / f".{card['id']}.lock", 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return                               # another worker is already making it
        path = _thumb_path(card['id'])
        if path.exists() and time.time() - path.stat().st_mtime < THUMB_MAX_AGE:
            return
        # One browser at a time on the whole server (all cards, all workers): small servers have little memory
        with open(THUMB_DIR / '.browser.lock', 'w') as browser:
            fcntl.flock(browser, fcntl.LOCK_EX)
            try:
                png = capture_page(card['url'])
            except SnapshotError as e:
                logger.warning(f"Thumbnail for {card['id']}: {e}")
                return
        img = Image.open(io.BytesIO(png)).convert('RGB')
        img.thumbnail((THUMB_WIDTH, THUMB_WIDTH))
        tmp = path.with_suffix('.tmp')
        img.save(tmp, 'JPEG', quality=82, optimize=True)
        tmp.replace(path)


def _refresh_in_background(card: Dict) -> None:
    threading.Thread(target=_make_thumbnail, args=(card,), daemon=True).start()


@home_bp.route('/')
def home_page():
    return render_template('home.html', active_nav='home')


@home_bp.route('/api/home', methods=['GET'])
def home_data():
    jobs = {j['id']: j for j in scheduler.status()['jobs']}
    out = []
    for card in cards():
        path = _thumb_path(card['id'])
        fresh = path.exists() and time.time() - path.stat().st_mtime < THUMB_MAX_AGE
        if not fresh:
            _refresh_in_background(card)
        job = jobs.get(card.get('job'))
        out.append({
            **card,
            'thumbnail': f"/home/thumbnail/{card['id']}.jpg?v={int(path.stat().st_mtime)}" if path.exists() else None,
            'schedule': {'time_label': job['time_label'], 'enabled': job['enabled'], 'next_run': job['next_run']} if job else None,
        })
    return jsonify({'cards': out})


@home_bp.route('/home/thumbnail/<card_id>.jpg', methods=['GET'])
def home_thumbnail(card_id):
    if not _card(card_id):
        abort(404)
    path = _thumb_path(card_id)
    if not path.exists():
        abort(404)
    return send_file(path, mimetype='image/jpeg', max_age=300)

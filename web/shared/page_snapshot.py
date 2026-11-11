"""
Screenshot of the live /ndo page (header, tiles and the Highlights section) for Slack.

Uses headless Chromium through Playwright. The web app must be running and reachable
at SNAPSHOT_BASE_URL. One-time setup on a server:
    venv/bin/python -m playwright install --with-deps chromium
"""
import logging

from web.auth import INTERNAL_HEADER, internal_token
from web.config import Config

logger = logging.getLogger(__name__)


class SnapshotError(RuntimeError):
    pass


def capture_dashboard(day: str = None, timeout_ms: int = 45000) -> bytes:
    try:
        from playwright.sync_api import Error as PlaywrightError, sync_playwright
    except ImportError:
        raise SnapshotError('Playwright is not installed (pip install -r web/requirements.txt)')

    url = f"{Config.SNAPSHOT_BASE_URL}/ndo?snapshot=1" + (f"&day={day}" if day else '')
    try:
        with sync_playwright() as p:
            launch = {'headless': True}
            if Config.SNAPSHOT_BROWSER_CHANNEL:
                launch['channel'] = Config.SNAPSHOT_BROWSER_CHANNEL
            browser = p.chromium.launch(**launch)
            try:
                # Always light: the Slack picture never follows a dark OS setting
                page = browser.new_page(viewport={'width': Config.SNAPSHOT_WIDTH, 'height': 1000},
                                        device_scale_factor=2, color_scheme='light')
                # The internal header lets the screenshot past the site login. Only requests to this
                # app get it: never the CDNs (fonts, icons), which would also reject the extra header.
                token = internal_token()
                page.route(f"{Config.SNAPSHOT_BASE_URL}/**",
                           lambda route: route.continue_(headers={**route.request.headers, INTERNAL_HEADER: token}))
                page.goto(url, wait_until='networkidle', timeout=timeout_ms)
                page.wait_for_selector('body[data-ready]', timeout=timeout_ms)
                if page.get_attribute('body', 'data-ready') != '1':
                    raise SnapshotError(f"Dashboard failed to load data at {url}")
                page.evaluate('document.fonts.ready.then(() => true)')
                return page.locator('#ndoSnapshotArea').screenshot(type='png', animations='disabled')
            finally:
                browser.close()
    except PlaywrightError as e:
        raise SnapshotError(f"Dashboard screenshot failed ({url}): {str(e).splitlines()[0]}")


def capture_page(path: str, width: int = 1440, height: int = 900, timeout_ms: int = 45000) -> bytes:
    """
    Screenshot of the top of any page of this site, without the sidebar (home-page thumbnails).
    Same login pass as capture_dashboard: only requests to this app get the internal header.
    """
    try:
        from playwright.sync_api import Error as PlaywrightError, sync_playwright
    except ImportError:
        raise SnapshotError('Playwright is not installed (pip install -r requirements.txt)')

    url = f"{Config.SNAPSHOT_BASE_URL}{path}"
    try:
        with sync_playwright() as p:
            launch = {'headless': True}
            if Config.SNAPSHOT_BROWSER_CHANNEL:
                launch['channel'] = Config.SNAPSHOT_BROWSER_CHANNEL
            browser = p.chromium.launch(**launch)
            try:
                page = browser.new_page(viewport={'width': width, 'height': height}, color_scheme='light')
                token = internal_token()
                page.route(f"{Config.SNAPSHOT_BASE_URL}/**",
                           lambda route: route.continue_(headers={**route.request.headers, INTERNAL_HEADER: token}))
                page.goto(url, wait_until='networkidle', timeout=timeout_ms)
                page.add_style_tag(content='.app-sidebar,.app-theme-toggle{display:none!important}'
                                           'body.has-sidebar{padding-left:2rem!important}')
                page.wait_for_timeout(2500)          # charts finish drawing
                page.evaluate('document.fonts.ready.then(() => true)')
                return page.screenshot(type='png', animations='disabled')
            finally:
                browser.close()
    except PlaywrightError as e:
        raise SnapshotError(f"Page screenshot failed ({url}): {str(e).splitlines()[0]}")

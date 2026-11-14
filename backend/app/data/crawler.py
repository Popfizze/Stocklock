"""Polite web crawler for step 2: reads the article or press release behind a dated event.

- robots.txt is honoured per site (read once per process; a site that refuses it is not crawled);
- HTML and plain text only, at most 1.5 MB per page, short timeouts, a few pages in parallel;
- SEC pages are requested with the SEC User-Agent (name and contact, EDGAR fair-access policy);
- what is kept from a page (title, description, publication date, first paragraphs) is cached 7 days.
"""

from __future__ import annotations

import re
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from app.config import get_settings
from app.data import cache, http
from app.data.cache import ExternalUnavailable

SOURCE = "Crawler web"
USER_AGENT = "StockLock-datathon-crawler/1.0 (projet etudiant, lecture ponctuelle)"
TEXT_MAX_CHARS = 4000
MAX_WORKERS = 6
CACHE_TTL_S = 7 * 86400

_SKIP = {"script", "style", "noscript", "nav", "footer", "header", "aside", "form", "svg", "button", "select"}
_BLOCK = {"p", "div", "li", "br", "tr", "h1", "h2", "h3", "h4", "section", "article", "table", "td"}
_DATE_META = ("article:published_time", "og:published_time", "datepublished", "publishdate", "pubdate",
              "date", "dc.date", "dc.date.issued", "sailthru.date", "parsely-pub-date")
_ISO_DAY = re.compile(r"(\d{4}-\d{2}-\d{2})")
_SPACES = re.compile(r"[ \t\r\f\v ]+")


@dataclass
class Page:
    url: str
    final_url: str
    title: str
    description: str
    published: str | None  # YYYY-MM-DD read from the page's meta tags, when it has one
    text: str
    from_cache: bool = False


class _Extractor(HTMLParser):
    """Title, meta description and publication date, paragraph text and all visible text."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.meta: dict[str, str] = {}
        self.time_attr: str | None = None
        self._skip = 0
        self._in_title = False
        self._in_p = 0
        self.paragraphs: list[str] = []
        self._p_buf: list[str] = []
        self.all_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag in _SKIP:
            self._skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            key = (a.get("property") or a.get("name") or a.get("itemprop") or "").lower()
            if key and a.get("content") and key not in self.meta:
                self.meta[key] = a["content"].strip()
        elif tag == "time" and self.time_attr is None and a.get("datetime"):
            self.time_attr = a["datetime"]
        if tag == "p":
            self._in_p += 1
        if tag in _BLOCK:
            self.all_text.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP and self._skip:
            self._skip -= 1
        elif tag == "title":
            self._in_title = False
        if tag == "p" and self._in_p:
            self._in_p -= 1
            text = _clean("".join(self._p_buf))
            if len(text) >= 40:
                self.paragraphs.append(text)
            self._p_buf = []
        if tag in _BLOCK:
            self.all_text.append("\n")

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
            return
        if self._skip:
            return
        self.all_text.append(data)
        if self._in_p:
            self._p_buf.append(data)


def _clean(text: str) -> str:
    return _SPACES.sub(" ", unescape(text)).strip()


def _day(value: str | None) -> str | None:
    match = _ISO_DAY.search(value or "")
    return match.group(1) if match else None


def parse(body: str, kind: str, url: str, final_url: str) -> Page:
    """What the pipeline keeps from a page: title, description, publication date, first paragraphs."""
    if kind == "text/plain":
        lines = [_clean(line) for line in body.splitlines()]
        text = "\n".join(line for line in lines if line)
        return Page(url, final_url, "", "", None, text[:TEXT_MAX_CHARS])
    ex = _Extractor()
    try:
        ex.feed(body)
        ex.close()
    except Exception:  # malformed HTML: keep whatever was read
        pass
    meta = ex.meta
    title = _clean(meta.get("og:title") or ex.title)
    description = _clean(meta.get("og:description") or meta.get("description") or meta.get("twitter:description")
                         or "")
    published = next((_day(meta[k]) for k in _DATE_META if _day(meta.get(k))), None) or _day(ex.time_attr)
    paragraphs = "\n".join(ex.paragraphs)
    if len(paragraphs) < 400:  # SEC exhibits and some sites put their text outside <p>
        lines = [_clean(line) for line in "".join(ex.all_text).splitlines()]
        paragraphs = "\n".join(line for line in lines if len(line) >= 3)
    return Page(url, final_url, title, description, published, paragraphs[:TEXT_MAX_CHARS])


# --- politeness ---------------------------------------------------------------------------------

_robots: dict[str, RobotFileParser | None] = {}
_robots_lock = threading.Lock()


def _is_sec(url: str) -> bool:
    return urlsplit(url).netloc.lower().endswith("sec.gov")


def _headers(url: str) -> dict[str, str]:
    agent = get_settings().sec_user_agent if _is_sec(url) else USER_AGENT
    return {"User-Agent": agent, "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
            "Accept-Language": "en,fr;q=0.8"}


def _site(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def allowed(url: str) -> bool:
    """robots.txt verdict for our User-Agent; a missing robots.txt (HTTP 404/410) allows everything,
    an unreachable or refused one (401/403, network error) allows nothing."""
    site = _site(url)
    with _robots_lock:
        known = site in _robots
        parser = _robots.get(site)
    if not known:
        parser = RobotFileParser()
        try:
            body, _, _ = http.get_text(SOURCE, site + "/robots.txt", headers=_headers(url),
                                       timeout_s=min(get_settings().http_timeout_s, 5.0), max_bytes=500_000)
            parser.parse(body.splitlines())
        except ExternalUnavailable as exc:
            if exc.reason in {"HTTP 404", "HTTP 410"}:
                parser.parse([])
            else:
                parser = None
        with _robots_lock:
            _robots[site] = parser
    if parser is None:
        return False
    return parser.can_fetch(_headers(url)["User-Agent"], url)


def reset() -> None:
    """Forget the robots.txt read so far (tests)."""
    with _robots_lock:
        _robots.clear()


# --- fetching -----------------------------------------------------------------------------------

def fetch_page(url: str) -> Page:
    """Raises ExternalUnavailable when the page cannot or may not be read."""
    def _fetch() -> dict:
        if not url.lower().startswith(("http://", "https://")):
            raise ExternalUnavailable(SOURCE, "adresse non web")
        if not allowed(url):
            raise ExternalUnavailable(SOURCE, "robots.txt du site refuse la lecture automatique")
        body, kind, final = http.get_text(SOURCE, url, headers=_headers(url),
                                          timeout_s=get_settings().http_timeout_s)
        page = parse(body, kind, url, final)
        if not (page.text or page.description or page.title):
            raise ExternalUnavailable(SOURCE, "page sans texte lisible")
        return asdict(page)

    value, hit = cache.cached("crawler", url, CACHE_TTL_S, _fetch)
    return Page(**{**value, "from_cache": hit})


def fetch_many(urls: list[str]) -> dict[str, Page | ExternalUnavailable]:
    """Each URL's page, or the reason it could not be read; a few requests at a time."""
    def one(url: str) -> Page | ExternalUnavailable:
        try:
            return fetch_page(url)
        except ExternalUnavailable as exc:
            return exc
        except Exception as exc:  # parsing or decoding bug: the page is skipped, never the stage
            return ExternalUnavailable(SOURCE, f"lecture impossible ({type(exc).__name__})")

    unique = list(dict.fromkeys(urls))
    if not unique:
        return {}
    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(unique))) as pool:
        return dict(zip(unique, pool.map(one, unique), strict=True))


_ROW = re.compile(r"<tr[^>]*>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
_CELL = re.compile(r"<td[^>]*>(.*?)</td>", re.IGNORECASE | re.DOTALL)
_HREF = re.compile(r'href="([^"]+)"', re.IGNORECASE)
_TAG = re.compile(r"<[^>]+>")


def exhibits_99(index_html: str) -> list[str]:
    """Paths of the EX-99.x documents listed in a filing's index page (type column)."""
    out = []
    for row in _ROW.findall(index_html):
        cells = [_clean(_TAG.sub("", c)) for c in _CELL.findall(row)]
        href = _HREF.search(row)
        if href and any(c.upper().startswith("EX-99") for c in cells) \
                and href.group(1).lower().endswith((".htm", ".html", ".txt")):
            out.append(href.group(1))
    return out


def sec_press_release(filing_url: str) -> str | None:
    """URL of an 8-K's press release (first EX-99.x of the filing's index page); None without one."""
    folder = filing_url.rsplit("/", 1)[0]
    acc = folder.rsplit("/", 1)[-1]
    if not (len(acc) == 18 and acc.isdigit()):
        return None
    index_url = f"{folder}/{acc[:10]}-{acc[10:12]}-{acc[12:]}-index.htm"

    def _fetch() -> list[str]:
        body, _, _ = http.get_text(SOURCE, index_url, headers=_headers(index_url),
                                   timeout_s=get_settings().http_timeout_s)
        return exhibits_99(body)

    paths, _ = cache.cached("crawler", index_url, CACHE_TTL_S, _fetch)
    if not paths:
        return None
    return "https://www.sec.gov" + paths[0] if paths[0].startswith("/") else paths[0]

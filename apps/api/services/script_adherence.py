# -*- coding: utf-8 -*-
"""
Script adherence: did the MANAGER say what the script asks for?

Pure functions: no database, no AI, no quota, the same answer every time. The words of the client never count: a
transcript is cut into turns by its "Менеджер:" / "Клиент:" labels (an optional "[mm:ss]" in front gives the second of
the phrase), and only the manager's turns are searched.

A script line ("anchor") is a short formulation; "|" separates interchangeable wordings:
    "меня зовут | это говорит | на связи"
An anchor is met when one wording has at least 60% of its significant words (compared by their first 5 letters, so
endings do not matter) in one manager turn or in two neighbouring manager turns. A stop phrase ("banned trigger") is met
when its words stand in a row inside a manager turn. The quote that comes back is the manager's own turn, word for word.
"""

import math
import re
from dataclasses import dataclass, field

STEM_LEN = 5
COVERAGE = 0.6  # share of an anchor's words that must be present
QUOTE_MAX = 300

_WORD = re.compile(r"[0-9a-zа-я]+")
# only words that carry no meaning in a formulation; question words (что, как, кто, когда) stay: they matter
_STOP = frozenset(
    "и в во на с со по к ко у о об от до за из не ни но а же ли бы мы вы я он она они это вас вам нас нам мне да так там тут вот уже или то".split()
)
_LINE = re.compile(
    r"^\s*(?:\[(?P<a>\d{1,2}):(?P<b>\d{2})(?::(?P<c>\d{2}))?[^\]]*\]\s*)?(?P<label>[^:\[\]\n]{1,30}?)\s*:\s*(?P<text>\S.*?)\s*$"
)


@dataclass
class Turn:
    speaker: str  # manager | client | other
    text: str
    ts: int | None = None  # second of the call, only when the transcript carries "[mm:ss]"


@dataclass
class Hit:
    quote: str
    ts: int | None


@dataclass
class ModuleResult:
    adhered: bool
    matched: list[str] = field(default_factory=list)  # the anchors that were met, as written in the script
    banned: list[str] = field(default_factory=list)  # the stop phrases that were said
    quote: str | None = None
    ts: int | None = None


def _norm(text: str) -> str:
    return text.lower().replace("ё", "е")


def _stem(word: str) -> str:
    return word[:STEM_LEN]


def _seconds(a: str, b: str, c: str | None) -> int:
    return int(a) * 3600 + int(b) * 60 + int(c) if c is not None else int(a) * 60 + int(b)


def _is_manager(label: str, names: set[str]) -> bool:
    label = _norm(label).strip()
    return label.startswith("менеджер") or label in names


def parse_turns(transcript: str | None, manager_name: str | None = None) -> list[Turn]:
    """Cut a transcript into turns. A line without a label continues the previous turn."""
    names = {w for w in _WORD.findall(_norm(manager_name or "")) if len(w) > 2}
    if manager_name:
        names.add(_norm(manager_name).strip())
    turns: list[Turn] = []
    for raw in (transcript or "").splitlines():
        if not raw.strip():
            continue
        m = _LINE.match(raw)
        if not m:
            if turns:
                turns[-1].text = (turns[-1].text + " " + raw.strip())[:4000]
            continue
        label = _norm(m.group("label")).strip()
        if _is_manager(label, names):
            speaker = "manager"
        elif label.startswith("клиент"):
            speaker = "client"
        else:
            speaker = "other"
        ts = _seconds(m.group("a"), m.group("b"), m.group("c")) if m.group("a") is not None else None
        turns.append(Turn(speaker, m.group("text"), ts))
    return turns


def has_manager_speech(turns: list[Turn]) -> bool:
    return any(t.speaker == "manager" for t in turns)


def _alternatives(anchor: str) -> list[set[str]]:
    out: list[set[str]] = []
    for alt in anchor.split("|"):
        words = _WORD.findall(_norm(alt))
        content = [w for w in words if w not in _STOP and len(w) > 2] or [w for w in words if w not in _STOP] or words
        if content:
            out.append({_stem(w) for w in content})
    return out


def _stems(text: str) -> set[str]:
    return {_stem(w) for w in _WORD.findall(_norm(text))}


def _windows(manager_turns: list[Turn], all_turns: list[Turn]) -> list[tuple[set[str], list[Turn]]]:
    """One window per manager turn, and one per pair of manager turns that stand at most one turn apart."""
    index = {id(t): i for i, t in enumerate(all_turns)}
    out = [(_stems(t.text), [t]) for t in manager_turns]
    for a, b in zip(manager_turns, manager_turns[1:]):
        if index[id(b)] - index[id(a)] <= 2:
            out.append((_stems(a.text) | _stems(b.text), [a, b]))
    return out


def _cut(text: str) -> str:
    text = " ".join(text.split())
    return text if len(text) <= QUOTE_MAX else text[: QUOTE_MAX - 1].rstrip() + "…"


def match_anchor(anchor: str, windows: list[tuple[set[str], list[Turn]]]) -> Hit | None:
    for stems in _alternatives(anchor):
        need = max(1, math.ceil(COVERAGE * len(stems)))
        for window_stems, turns in windows:
            if len(stems & window_stems) >= need:
                best = max(turns, key=lambda t: len(stems & _stems(t.text)))
                return Hit(_cut(best.text), best.ts)
    return None


def match_banned(phrase: str, manager_turns: list[Turn]) -> Hit | None:
    wanted = [_stem(w) for w in _WORD.findall(_norm(phrase))]
    if not wanted:
        return None
    for turn in manager_turns:
        seq = [_stem(w) for w in _WORD.findall(_norm(turn.text))]
        for i in range(len(seq) - len(wanted) + 1):
            if seq[i : i + len(wanted)] == wanted:
                return Hit(_cut(turn.text), turn.ts)
    return None


def evaluate_module(anchors: list[str], banned: list[str], min_required: int, turns: list[Turn]) -> ModuleResult:
    """adhered = enough anchors were said AND no stop phrase was said, looking at the manager's turns only."""
    manager_turns = [t for t in turns if t.speaker == "manager"]
    windows = _windows(manager_turns, turns)
    matched: list[str] = []
    first_hit: Hit | None = None
    for anchor in anchors:
        hit = match_anchor(anchor, windows)
        if hit:
            matched.append(anchor)
            first_hit = first_hit or hit
    said: list[str] = []
    banned_hit: Hit | None = None
    for phrase in banned:
        hit = match_banned(phrase, manager_turns)
        if hit:
            said.append(phrase)
            banned_hit = banned_hit or hit
    needed = min(max(int(min_required or 0), 0), len(anchors))
    adhered = len(matched) >= needed and not said
    shown = first_hit if adhered else (banned_hit or first_hit)
    return ModuleResult(adhered, matched, said, shown.quote if shown else None, shown.ts if shown else None)

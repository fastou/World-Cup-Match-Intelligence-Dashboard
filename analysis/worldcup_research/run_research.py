#!/usr/bin/env python3
"""
World Cup research runner.

This script creates an auditable research report from the archived dashboard
history. It intentionally keeps prediction evaluation separate from trading
automation: every simulated return is a historical research metric only.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import re
import ssl
import sqlite3
import statistics
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "data" / "worldcup-history.sqlite"
DEFAULT_OUT = ROOT / "analysis" / "output"
ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"
DATE_START = dt.date(2026, 6, 12)
DATE_END = dt.date(2026, 7, 19)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build World Cup research datasets and reports.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite history DB path.")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Output directory.")
    parser.add_argument("--fetch-espn", action="store_true", help="Fetch ESPN public scoreboard results.")
    parser.add_argument("--backfill-results", action="store_true", help="Backfill missing DB results from ESPN.")
    parser.add_argument("--write-db", action="store_true", help="Actually write DB backfill rows.")
    parser.add_argument("--refresh-existing", action="store_true", help="Replace existing result rows too.")
    return parser.parse_args()


def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def parse_json(value: Any) -> dict[str, Any]:
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def parse_time(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def fmt_pct(value: float | None, digits: int = 1) -> str:
    if value is None or not math.isfinite(value):
        return "-"
    return f"{value * 100:.{digits}f}%"


def fmt_num(value: float | None, digits: int = 2) -> str:
    if value is None or not math.isfinite(value):
        return "-"
    return f"{value:.{digits}f}"


def safe_div(numerator: float, denominator: float) -> float | None:
    if not denominator:
        return None
    return numerator / denominator


def clamp_probability(value: float | None) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return min(0.999999, max(0.000001, value))


def brier(probabilities: Iterable[float], outcomes: Iterable[int]) -> float | None:
    pairs = [(p, o) for p, o in zip(probabilities, outcomes) if p is not None]
    if not pairs:
        return None
    return sum((p - o) ** 2 for p, o in pairs) / len(pairs)


def log_loss(probabilities: Iterable[float], outcomes: Iterable[int]) -> float | None:
    pairs = [(clamp_probability(p), o) for p, o in zip(probabilities, outcomes) if p is not None]
    if not pairs:
        return None
    return -sum(o * math.log(p) + (1 - o) * math.log(1 - p) for p, o in pairs) / len(pairs)


def pearson(xs: list[float], ys: list[float]) -> float | None:
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(pairs) < 3:
        return None
    x_values = [x for x, _ in pairs]
    y_values = [y for _, y in pairs]
    x_mean = statistics.mean(x_values)
    y_mean = statistics.mean(y_values)
    x_var = sum((x - x_mean) ** 2 for x in x_values)
    y_var = sum((y - y_mean) ** 2 for y in y_values)
    if x_var <= 0 or y_var <= 0:
        return None
    return sum((x - x_mean) * (y - y_mean) for x, y in pairs) / math.sqrt(x_var * y_var)


def date_range(start: dt.date, end: dt.date) -> Iterable[dt.date]:
    current = start
    while current <= end:
        yield current
        current += dt.timedelta(days=1)


def fetch_json(url: str, timeout: int = 20) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "worldcup-research/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as error:
        if "CERTIFICATE_VERIFY_FAILED" not in str(error):
            raise
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
            return json.loads(response.read().decode("utf-8"))


def int_or_none(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(float(str(value).strip()))
    except Exception:
        return None


def line_score_value(line: dict[str, Any]) -> int:
    for key in ("value", "displayValue"):
        value = int_or_none(line.get(key))
        if value is not None:
            return value
    return 0


def competitor_goals(competitor: dict[str, Any]) -> tuple[int, int, int | None]:
    lines = competitor.get("linescores") or []
    period_values = [line_score_value(item) for item in lines if isinstance(item, dict)]
    score_value = int_or_none(competitor.get("score"))
    if len(period_values) >= 2:
        regulation = period_values[0] + period_values[1]
    elif score_value is not None:
        regulation = score_value
    else:
        regulation = 0
    extra = sum(period_values[2:4]) if len(period_values) >= 4 else 0
    return regulation, regulation + extra, score_value


def result_key(home_goals: int, away_goals: int) -> str:
    if home_goals > away_goals:
        return "home"
    if home_goals < away_goals:
        return "away"
    return "draw"


def normalize_espn_event(event: dict[str, Any]) -> dict[str, Any] | None:
    status = (((event.get("status") or {}).get("type") or {}))
    if not status.get("completed") and status.get("state") != "post":
        return None
    competition = (event.get("competitions") or [{}])[0]
    competitors = competition.get("competitors") or []
    home = next((item for item in competitors if item.get("homeAway") == "home"), None)
    away = next((item for item in competitors if item.get("homeAway") == "away"), None)
    if not home or not away:
        return None
    home_team = home.get("team") or {}
    away_team = away.get("team") or {}
    home_reg, home_after_extra, home_final = competitor_goals(home)
    away_reg, away_after_extra, away_final = competitor_goals(away)
    if home_final is None:
        home_final = home_after_extra
    if away_final is None:
        away_final = away_after_extra
    winner_side = None
    if home.get("winner") is True:
        winner_side = "home"
    elif away.get("winner") is True:
        winner_side = "away"
    elif home_final != away_final:
        winner_side = result_key(home_final, away_final)
    event_id = str(event.get("id") or "")
    return {
        "match_id": f"schedule-{event_id}",
        "event_id": event_id,
        "date": str(event.get("date") or competition.get("date") or ""),
        "name": event.get("name") or "",
        "home_name": home_team.get("displayName") or home_team.get("name") or "",
        "away_name": away_team.get("displayName") or away_team.get("name") or "",
        "regulation_home_goals": home_reg,
        "regulation_away_goals": away_reg,
        "regulation_result_key": result_key(home_reg, away_reg),
        "after_extra_home_goals": home_after_extra,
        "after_extra_away_goals": away_after_extra,
        "final_home_goals": home_final,
        "final_away_goals": away_final,
        "advance_result_key": winner_side or result_key(home_final, away_final),
        "status_name": status.get("name") or "",
        "status_description": status.get("description") or "",
        "status_detail": status.get("detail") or status.get("shortDetail") or "",
        "source": "ESPN FIFA World Cup scoreboard",
        "payload": {
            "event": event,
            "regulation": {
                "homeGoals": home_reg,
                "awayGoals": away_reg,
                "resultKey": result_key(home_reg, away_reg),
            },
            "afterExtra": {
                "homeGoals": home_after_extra,
                "awayGoals": away_after_extra,
            },
            "final": {
                "homeGoals": home_final,
                "awayGoals": away_final,
                "advanceResultKey": winner_side or result_key(home_final, away_final),
            },
        },
    }


def fetch_espn_results(start: dt.date = DATE_START, end: dt.date = DATE_END) -> list[dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for day in date_range(start, end):
        url = f"{ESPN_SCOREBOARD}?{urllib.parse.urlencode({'dates': day.strftime('%Y%m%d')})}"
        data = fetch_json(url)
        for event in data.get("events") or []:
            normalized = normalize_espn_event(event)
            if normalized:
                results[normalized["match_id"]] = normalized
        time.sleep(0.08)
    return [results[key] for key in sorted(results)]


def load_espn_results(out_dir: Path, fetch: bool) -> list[dict[str, Any]]:
    cache_path = out_dir / "tables" / "espn_worldcup_results.csv"
    if fetch or not cache_path.exists():
        results = fetch_espn_results()
        write_csv(cache_path, results, [
            "match_id", "event_id", "date", "home_name", "away_name",
            "regulation_home_goals", "regulation_away_goals", "regulation_result_key",
            "after_extra_home_goals", "after_extra_away_goals",
            "final_home_goals", "final_away_goals", "advance_result_key",
            "status_name", "status_description", "status_detail", "source",
        ])
        return results
    rows: list[dict[str, Any]] = []
    with cache_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            for key in [
                "regulation_home_goals", "regulation_away_goals",
                "after_extra_home_goals", "after_extra_away_goals",
                "final_home_goals", "final_away_goals",
            ]:
                row[key] = int_or_none(row.get(key)) or 0
            rows.append(row)
    return rows


def load_matches(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    query = """
    SELECT match_id, home_name, away_name, group_name, kickoff_shanghai, venue
    FROM matches
    WHERE match_id LIKE 'schedule-%'
    ORDER BY kickoff_shanghai, match_id
    """
    return [dict(row) for row in conn.execute(query)]


def load_results(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    for row in conn.execute("SELECT * FROM match_results WHERE match_id LIKE 'schedule-%'"):
        item = dict(row)
        payload = parse_json(item.get("payload_json"))
        item["payload"] = payload
        regulation = payload.get("regulation") if isinstance(payload.get("regulation"), dict) else {}
        final = payload.get("final") if isinstance(payload.get("final"), dict) else {}
        item["regulation_home_goals"] = int_or_none(regulation.get("homeGoals")) if regulation else int_or_none(item.get("home_goals"))
        item["regulation_away_goals"] = int_or_none(regulation.get("awayGoals")) if regulation else int_or_none(item.get("away_goals"))
        item["regulation_result_key"] = regulation.get("resultKey") or item.get("result_key")
        item["final_home_goals"] = int_or_none(final.get("homeGoals")) if final else int_or_none(item.get("home_goals"))
        item["final_away_goals"] = int_or_none(final.get("awayGoals")) if final else int_or_none(item.get("away_goals"))
        item["advance_result_key"] = final.get("advanceResultKey") or item["regulation_result_key"]
        rows[item["match_id"]] = item
    return rows


def backfill_results(
    conn: sqlite3.Connection,
    matches: list[dict[str, Any]],
    espn_results: list[dict[str, Any]],
    write_db: bool,
    refresh_existing: bool,
) -> dict[str, Any]:
    match_ids = {match["match_id"] for match in matches}
    existing = load_results(conn)
    candidates = [item for item in espn_results if item["match_id"] in match_ids]
    to_write = [
        item for item in candidates
        if refresh_existing or item["match_id"] not in existing
    ]
    if write_db and to_write:
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        with conn:
            for item in to_write:
                result_label = {
                    "home": f"{item['home_name']}胜",
                    "away": f"{item['away_name']}胜",
                    "draw": "平局",
                }.get(item["regulation_result_key"], item["regulation_result_key"])
                payload = {
                    "matchId": item["match_id"],
                    "homeName": item["home_name"],
                    "awayName": item["away_name"],
                    "homeGoals": item["regulation_home_goals"],
                    "awayGoals": item["regulation_away_goals"],
                    "resultKey": item["regulation_result_key"],
                    "resultLabel": result_label,
                    "status": "final",
                    "finishedAt": item["date"],
                    "source": "ESPN FIFA World Cup scoreboard backfill",
                    "regulation": {
                        "homeGoals": item["regulation_home_goals"],
                        "awayGoals": item["regulation_away_goals"],
                        "resultKey": item["regulation_result_key"],
                    },
                    "afterExtra": {
                        "homeGoals": item["after_extra_home_goals"],
                        "awayGoals": item["after_extra_away_goals"],
                    },
                    "final": {
                        "homeGoals": item["final_home_goals"],
                        "awayGoals": item["final_away_goals"],
                        "advanceResultKey": item["advance_result_key"],
                    },
                    "espn": {
                        "eventId": item["event_id"],
                        "statusName": item["status_name"],
                        "statusDescription": item["status_description"],
                        "statusDetail": item["status_detail"],
                    },
                }
                conn.execute(
                    """
                    INSERT OR REPLACE INTO match_results
                    (match_id, home_goals, away_goals, result_key, result_label, status, finished_at, source, payload_json, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'final', ?, ?, ?, ?)
                    """,
                    (
                        item["match_id"],
                        item["regulation_home_goals"],
                        item["regulation_away_goals"],
                        item["regulation_result_key"],
                        result_label,
                        item["date"],
                        "ESPN FIFA World Cup scoreboard backfill",
                        json.dumps(payload, ensure_ascii=False),
                        now,
                    ),
                )
    return {
        "candidate_count": len(candidates),
        "existing_count": sum(1 for item in candidates if item["match_id"] in existing),
        "to_write_count": len(to_write),
        "written": bool(write_db),
        "ids": [item["match_id"] for item in to_write],
    }


def load_match_snapshots(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    query = """
    SELECT *
    FROM match_snapshots
    WHERE match_id LIKE 'schedule-%'
    ORDER BY match_id, captured_at
    """
    return [dict(row) for row in conn.execute(query)]


def select_prematch_snapshots(matches: list[dict[str, Any]], snapshots: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_match: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for snapshot in snapshots:
        by_match[snapshot["match_id"]].append(snapshot)
    selected: dict[str, dict[str, Any]] = {}
    for match in matches:
        kickoff = parse_time(match.get("kickoff_shanghai"))
        rows = by_match.get(match["match_id"], [])
        if not rows:
            continue
        pre_rows = []
        for row in rows:
            captured = parse_time(row.get("captured_at"))
            if kickoff and captured and captured <= kickoff:
                pre_rows.append(row)
        if pre_rows:
            selected[match["match_id"]] = pre_rows[-1] | {"selection_reason": "latest_before_kickoff"}
        else:
            selected[match["match_id"]] = rows[0] | {"selection_reason": "first_available_after_kickoff_or_unknown"}
    return selected


def load_markets_for_snapshots(conn: sqlite3.Connection, snapshot_ids: list[str]) -> list[dict[str, Any]]:
    if not snapshot_ids:
        return []
    rows: list[dict[str, Any]] = []
    for index in range(0, len(snapshot_ids), 800):
        chunk = snapshot_ids[index:index + 800]
        placeholders = ",".join("?" for _ in chunk)
        query = f"""
        SELECT *
        FROM market_snapshots
        WHERE snapshot_id IN ({placeholders})
        ORDER BY match_id, market_type, recommendation_key
        """
        rows.extend(dict(row) for row in conn.execute(query, chunk))
    return rows


def load_live_snapshots(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    query = """
    SELECT *
    FROM live_match_snapshots
    WHERE match_id LIKE 'schedule-%'
    ORDER BY match_id, captured_at
    """
    return [dict(row) for row in conn.execute(query)]


def load_inplay_recommendations(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    query = """
    SELECT r.*, l.captured_at, l.minute, l.home_score, l.away_score, l.data_quality
    FROM inplay_recommendation_snapshots r
    JOIN live_match_snapshots l ON l.id = r.live_snapshot_id
    WHERE r.match_id LIKE 'schedule-%'
    ORDER BY r.match_id, l.captured_at, r.market_type
    """
    return [dict(row) for row in conn.execute(query)]


def load_rows_for_matches(conn: sqlite3.Connection, table: str, match_ids: list[str]) -> list[dict[str, Any]]:
    if not match_ids:
        return []
    rows: list[dict[str, Any]] = []
    for index in range(0, len(match_ids), 800):
        chunk = match_ids[index:index + 800]
        placeholders = ",".join("?" for _ in chunk)
        query = f"""
        SELECT t.*, ms.captured_at AS snapshot_captured_at
        FROM {table} t
        LEFT JOIN match_snapshots ms ON ms.snapshot_id = t.snapshot_id
        WHERE t.match_id IN ({placeholders})
        """
        rows.extend(dict(row) for row in conn.execute(query, chunk))
    return rows


def choose_latest_pre_kickoff(rows: list[dict[str, Any]], kickoff: str | None) -> dict[str, Any] | None:
    if not rows:
        return None
    kickoff_time = parse_time(kickoff)
    pre_rows = []
    for row in rows:
        captured = parse_time(row.get("snapshot_captured_at") or row.get("updated_at"))
        if kickoff_time and captured and captured <= kickoff_time:
            pre_rows.append(row)
    candidates = pre_rows or rows
    return sorted(
        candidates,
        key=lambda item: parse_time(item.get("snapshot_captured_at") or item.get("updated_at")) or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
    )[-1]


def side_rows_by_match(rows: list[dict[str, Any]]) -> dict[tuple[str, str], list[dict[str, Any]]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        side = str(row.get("side") or "")
        if side:
            grouped[(row["match_id"], side)].append(row)
    return grouped


def rows_by_match(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["match_id"]].append(row)
    return grouped


def rate_from_record(row: dict[str, Any] | None, key: str) -> float | None:
    if not row:
        return None
    matches = int_or_none(row.get("matches")) or 0
    if matches <= 0:
        return None
    value = int_or_none(row.get(key))
    if value is None:
        return None
    return value / matches


def per_match_value(row: dict[str, Any] | None, key: str) -> float | None:
    if not row:
        return None
    matches = int_or_none(row.get("matches")) or 0
    if matches <= 0:
        return None
    value = int_or_none(row.get(key))
    if value is None:
        return None
    return value / matches


def diff_value(home_row: dict[str, Any] | None, away_row: dict[str, Any] | None, key: str) -> float | None:
    if not home_row or not away_row:
        return None
    home = home_row.get(key)
    away = away_row.get(key)
    if home is None or away is None:
        return None
    try:
        return float(home) - float(away)
    except Exception:
        return None


def background_feature_rows(
    conn: sqlite3.Connection,
    matches: list[dict[str, Any]],
    selected_by_match: dict[str, dict[str, Any]],
    results_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    match_ids = [match["match_id"] for match in matches]
    recent_by_side = side_rows_by_match(load_rows_for_matches(conn, "recent_form_snapshots", match_ids))
    squad_by_side = side_rows_by_match(load_rows_for_matches(conn, "squad_profile_snapshots", match_ids))
    record_by_side = side_rows_by_match(load_rows_for_matches(conn, "world_cup_record_snapshots", match_ids))
    h2h_by_match = rows_by_match(load_rows_for_matches(conn, "head_to_head_snapshots", match_ids))
    context_by_match = rows_by_match(load_rows_for_matches(conn, "context_signal_snapshots", match_ids))
    human_by_match = rows_by_match(load_rows_for_matches(conn, "human_matchup_snapshots", match_ids))

    output = []
    for match in matches:
        result = results_by_id.get(match["match_id"])
        snapshot = selected_by_match.get(match["match_id"], {})
        if not result or not snapshot:
            continue
        kickoff = match.get("kickoff_shanghai")
        home_form = choose_latest_pre_kickoff(recent_by_side.get((match["match_id"], "home"), []), kickoff)
        away_form = choose_latest_pre_kickoff(recent_by_side.get((match["match_id"], "away"), []), kickoff)
        home_squad = choose_latest_pre_kickoff(squad_by_side.get((match["match_id"], "home"), []), kickoff)
        away_squad = choose_latest_pre_kickoff(squad_by_side.get((match["match_id"], "away"), []), kickoff)
        home_record = choose_latest_pre_kickoff(record_by_side.get((match["match_id"], "home"), []), kickoff)
        away_record = choose_latest_pre_kickoff(record_by_side.get((match["match_id"], "away"), []), kickoff)
        h2h = choose_latest_pre_kickoff(h2h_by_match.get(match["match_id"], []), kickoff)
        context = choose_latest_pre_kickoff(context_by_match.get(match["match_id"], []), kickoff)
        human = choose_latest_pre_kickoff(human_by_match.get(match["match_id"], []), kickoff)

        home_goals = int_or_none(result.get("regulation_home_goals")) or 0
        away_goals = int_or_none(result.get("regulation_away_goals")) or 0
        lambda_home = snapshot.get("lambda_home")
        lambda_away = snapshot.get("lambda_away")
        lambda_home = float(lambda_home) if lambda_home is not None else None
        lambda_away = float(lambda_away) if lambda_away is not None else None
        form_home_points = (
            ((int_or_none(home_form.get("wins")) or 0) * 3 + (int_or_none(home_form.get("draws")) or 0))
            / ((int_or_none(home_form.get("matches")) or 0) * 3)
            if home_form and (int_or_none(home_form.get("matches")) or 0) > 0 else None
        )
        form_away_points = (
            ((int_or_none(away_form.get("wins")) or 0) * 3 + (int_or_none(away_form.get("draws")) or 0))
            / ((int_or_none(away_form.get("matches")) or 0) * 3)
            if away_form and (int_or_none(away_form.get("matches")) or 0) > 0 else None
        )
        h2h_matches = int_or_none(h2h.get("matches")) if h2h else None
        h2h_home_wins = int_or_none(h2h.get("home_wins")) if h2h else None
        h2h_away_wins = int_or_none(h2h.get("away_wins")) if h2h else None
        output.append({
            "match_id": match["match_id"],
            "match": f"{match.get('home_name')} vs {match.get('away_name')}",
            "kickoff_shanghai": kickoff,
            "stage": stage_for(kickoff),
            "home_goals": home_goals,
            "away_goals": away_goals,
            "home_win": 1 if home_goals > away_goals else 0,
            "away_win": 1 if away_goals > home_goals else 0,
            "draw": 1 if home_goals == away_goals else 0,
            "over25": 1 if home_goals + away_goals > 2.5 else 0,
            "under25": 1 if home_goals + away_goals < 2.5 else 0,
            "btts": 1 if home_goals > 0 and away_goals > 0 else 0,
            "favorite_side": "home" if (lambda_home or 0) > (lambda_away or 0) else "away" if (lambda_away or 0) > (lambda_home or 0) else "none",
            "favorite_win": 1 if ((lambda_home or 0) > (lambda_away or 0) and home_goals > away_goals) or ((lambda_away or 0) > (lambda_home or 0) and away_goals > home_goals) else 0,
            "xg_diff_home": (lambda_home - lambda_away) if lambda_home is not None and lambda_away is not None else None,
            "xg_abs_diff": abs(lambda_home - lambda_away) if lambda_home is not None and lambda_away is not None else None,
            "xg_balance": -abs(lambda_home - lambda_away) if lambda_home is not None and lambda_away is not None else None,
            "xg_total": (lambda_home + lambda_away) if lambda_home is not None and lambda_away is not None else None,
            "group_home_xg_delta": snapshot.get("group_situation_home_xg_delta"),
            "group_away_xg_delta": snapshot.get("group_situation_away_xg_delta"),
            "group_delta_diff_home": (
                float(snapshot.get("group_situation_home_xg_delta") or 0)
                - float(snapshot.get("group_situation_away_xg_delta") or 0)
            ),
            "physical_home_xg_delta": snapshot.get("physical_home_xg_delta"),
            "physical_away_xg_delta": snapshot.get("physical_away_xg_delta"),
            "physical_delta_diff_home": (
                float(snapshot.get("physical_home_xg_delta") or 0)
                - float(snapshot.get("physical_away_xg_delta") or 0)
            ),
            "physical_draw_delta": snapshot.get("physical_draw_delta"),
            "context_home_xg_delta": context.get("home_xg_delta") if context else None,
            "context_away_xg_delta": context.get("away_xg_delta") if context else None,
            "context_diff_home": (
                float(context.get("home_xg_delta") or 0) - float(context.get("away_xg_delta") or 0)
                if context else None
            ),
            "context_btts_delta": context.get("btts_delta") if context else None,
            "context_over25_delta": context.get("over25_delta") if context else None,
            "context_draw_delta": context.get("draw_delta") if context else None,
            "form_points_diff_home": (
                form_home_points - form_away_points
                if form_home_points is not None and form_away_points is not None else None
            ),
            "form_gf_diff_home": (
                per_match_value(home_form, "goals_for") - per_match_value(away_form, "goals_for")
                if per_match_value(home_form, "goals_for") is not None and per_match_value(away_form, "goals_for") is not None else None
            ),
            "form_ga_diff_home": (
                per_match_value(home_form, "goals_against") - per_match_value(away_form, "goals_against")
                if per_match_value(home_form, "goals_against") is not None and per_match_value(away_form, "goals_against") is not None else None
            ),
            "form_total_goals": (
                per_match_value(home_form, "goals_for") + per_match_value(home_form, "goals_against")
                + per_match_value(away_form, "goals_for") + per_match_value(away_form, "goals_against")
                if all(value is not None for value in [
                    per_match_value(home_form, "goals_for"),
                    per_match_value(home_form, "goals_against"),
                    per_match_value(away_form, "goals_for"),
                    per_match_value(away_form, "goals_against"),
                ]) else None
            ),
            "height_diff_home": diff_value(home_squad, away_squad, "avg_height_cm"),
            "age_diff_home": diff_value(home_squad, away_squad, "avg_age"),
            "caps_diff_home": diff_value(home_squad, away_squad, "avg_caps"),
            "top_tier_diff_home": diff_value(home_squad, away_squad, "top_tier_share"),
            "gk_score_diff_home": diff_value(home_squad, away_squad, "gk_score"),
            "df_score_diff_home": diff_value(home_squad, away_squad, "df_score"),
            "mf_score_diff_home": diff_value(home_squad, away_squad, "mf_score"),
            "fw_score_diff_home": diff_value(home_squad, away_squad, "fw_score"),
            "wc_appearances_diff_home": diff_value(home_record, away_record, "appearances"),
            "wc_titles_diff_home": diff_value(home_record, away_record, "titles"),
            "wc_win_rate_diff_home": (
                rate_from_record(home_record, "wins") - rate_from_record(away_record, "wins")
                if rate_from_record(home_record, "wins") is not None and rate_from_record(away_record, "wins") is not None else None
            ),
            "h2h_matches": h2h_matches,
            "h2h_home_win_share": (h2h_home_wins / h2h_matches) if h2h_matches and h2h_home_wins is not None else None,
            "h2h_away_win_share": (h2h_away_wins / h2h_matches) if h2h_matches and h2h_away_wins is not None else None,
            "h2h_goal_total_per_match": (
                ((int_or_none(h2h.get("home_goals")) or 0) + (int_or_none(h2h.get("away_goals")) or 0)) / h2h_matches
                if h2h and h2h_matches else None
            ),
            "has_human_matchup_summary": 1 if human and (human.get("summary") or human.get("ai_summary")) else 0,
        })
    return output


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if fieldnames is None:
        fields: list[str] = []
        for row in rows:
            for key in row:
                if key not in fields and key != "payload":
                    fields.append(key)
        fieldnames = fields
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def write_markdown(path: Path, text: str) -> None:
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def stage_for(kickoff: str | None) -> str:
    parsed = parse_time(kickoff)
    if not parsed:
        return "unknown"
    day = parsed.date()
    if day <= dt.date(2026, 6, 20):
        return "modelled_group_window"
    if day <= dt.date(2026, 7, 1):
        return "results_only_middle_window"
    if day <= dt.date(2026, 7, 7):
        return "knockout_early"
    if day <= dt.date(2026, 7, 12):
        return "quarterfinal_window"
    if day <= dt.date(2026, 7, 15):
        return "semifinal_window"
    return "final_window"


def market_side_from_row(row: dict[str, Any], match: dict[str, Any] | None = None) -> str | None:
    key = str(row.get("recommendation_key") or "")
    if key in ("home", "away", "draw"):
        return key
    if key in ("advance-home", "advance-away"):
        return key.split("-")[-1]
    if key.endswith("-home"):
        return "home"
    if key.endswith("-away"):
        return "away"
    name = str(row.get("market_name") or "")
    if match:
        home = str(match.get("home_name") or "")
        away = str(match.get("away_name") or "")
        if home and name.startswith(home):
            return "home"
        if away and name.startswith(away):
            return "away"
    return None


def handicap_line(row: dict[str, Any]) -> float | None:
    name = str(row.get("market_name") or "")
    key = str(row.get("recommendation_key") or "")
    match = re.search(r"([+-]\d+(?:\.\d+)?)", name)
    if match:
        return float(match.group(1))
    match = re.search(r"(让|受让)\s*(\d+(?:\.\d+)?)", name)
    if match:
        value = float(match.group(2))
        return value if match.group(1) == "受让" else -value
    match = re.search(r"handicap-(home|away)-([0-9]+(?:pt[0-9]+)?)", key)
    if match:
        text = match.group(2).replace("pt", ".")
        return -float(text)
    return None


def total_line(row: dict[str, Any]) -> float:
    name = str(row.get("market_name") or "")
    key = str(row.get("recommendation_key") or "").lower()
    name_match = re.search(r"(\d+(?:\.\d+)?)", name)
    if name_match:
        return float(name_match.group(1))
    key_match = re.search(r"(?:over|under)(\d)(?:pt|p|_)?(\d)", key)
    if key_match:
        return float(f"{key_match.group(1)}.{key_match.group(2)}")
    key_match = re.search(r"(?:over|under)(\d+)", key)
    if key_match:
        digits = key_match.group(1)
        if len(digits) == 2:
            return float(f"{digits[0]}.{digits[1]}")
        return float(digits)
    return 2.5


def settle_market(row: dict[str, Any], result: dict[str, Any] | None, match: dict[str, Any] | None = None) -> int | None:
    if not result:
        return None
    market_type = str(row.get("market_type") or "")
    key = str(row.get("recommendation_key") or "")
    home_goals = int_or_none(result.get("regulation_home_goals"))
    away_goals = int_or_none(result.get("regulation_away_goals"))
    if home_goals is None or away_goals is None:
        return None
    if market_type == "moneyline":
        return 1 if key == result.get("regulation_result_key") else 0
    if market_type == "advance":
        if key == "advance-home":
            return 1 if result.get("advance_result_key") == "home" else 0
        if key == "advance-away":
            return 1 if result.get("advance_result_key") == "away" else 0
        return None
    if market_type == "total":
        line = total_line(row)
        total = home_goals + away_goals
        lower_key = key.lower() + " " + str(row.get("market_name") or "").lower()
        if "over" in lower_key or "大于" in lower_key:
            if total == line:
                return None
            return 1 if total > line else 0
        if "under" in lower_key or "小于" in lower_key:
            if total == line:
                return None
            return 1 if total < line else 0
        return None
    if market_type == "btts":
        yes = home_goals > 0 and away_goals > 0
        lower_key = key.lower() + " " + str(row.get("market_name") or "").lower()
        if "yes" in lower_key or "都有进球" in lower_key and "不是" not in lower_key:
            return 1 if yes else 0
        if "no" in lower_key or "不是" in lower_key:
            return 1 if not yes else 0
        return None
    if market_type == "handicap":
        side = market_side_from_row(row, match)
        line = handicap_line(row)
        if side not in ("home", "away") or line is None:
            return None
        side_goals = home_goals if side == "home" else away_goals
        other_goals = away_goals if side == "home" else home_goals
        adjusted = side_goals + line
        if abs(adjusted - other_goals) < 1e-9:
            return None
        return 1 if adjusted > other_goals else 0
    return None


def enrich_market_rows(
    market_rows: list[dict[str, Any]],
    matches_by_id: dict[str, dict[str, Any]],
    results_by_id: dict[str, dict[str, Any]],
    snapshots_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for row in market_rows:
        match = matches_by_id.get(row["match_id"])
        result = results_by_id.get(row["match_id"])
        snapshot = snapshots_by_id.get(row["snapshot_id"], {})
        settled = settle_market(row, result, match)
        price = row.get("market_price")
        edge = row.get("edge")
        model_prob = row.get("model_probability")
        enriched.append({
            **row,
            "home_name": match.get("home_name") if match else "",
            "away_name": match.get("away_name") if match else "",
            "kickoff_shanghai": match.get("kickoff_shanghai") if match else "",
            "stage": stage_for(match.get("kickoff_shanghai") if match else None),
            "selection_reason": snapshot.get("selection_reason", ""),
            "prediction_key": snapshot.get("prediction_key", ""),
            "prediction_probability": snapshot.get("prediction_probability"),
            "prediction_confidence": snapshot.get("prediction_confidence", ""),
            "completeness_mode": snapshot.get("completeness_mode", ""),
            "completeness_score": snapshot.get("completeness_score"),
            "lambda_home": snapshot.get("lambda_home"),
            "lambda_away": snapshot.get("lambda_away"),
            "settled": settled,
            "market_price": float(price) if price is not None else None,
            "edge": float(edge) if edge is not None else None,
            "model_probability": float(model_prob) if model_prob is not None else None,
            "flat_profit_per_1": flat_profit(float(price), settled) if price is not None else None,
        })
    return enriched


def flat_profit(price: float | None, settled: int | None) -> float | None:
    if settled is None or price is None or not math.isfinite(price) or price <= 0.01 or price >= 0.99:
        return None
    if settled:
        return (1 / price) - 1
    return -1.0


def group_stats(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row.get(key) or "unknown")].append(row)
    output = []
    for value, items in sorted(grouped.items()):
        settled_items = [item for item in items if item.get("settled") is not None]
        probs = [item.get("model_probability") for item in settled_items]
        hits = [int(item.get("settled")) for item in settled_items]
        profits = [item.get("flat_profit_per_1") for item in settled_items if item.get("flat_profit_per_1") is not None]
        output.append({
            key: value,
            "rows": len(items),
            "settled": len(settled_items),
            "hit_rate": safe_div(sum(hits), len(hits)) if hits else None,
            "avg_model_probability": statistics.mean([p for p in probs if p is not None]) if any(p is not None for p in probs) else None,
            "brier": brier([p for p in probs if p is not None], hits[:len([p for p in probs if p is not None])]) if hits else None,
            "log_loss": log_loss([p for p in probs if p is not None], hits[:len([p for p in probs if p is not None])]) if hits else None,
            "flat_roi": statistics.mean(profits) if profits else None,
        })
    return output


def calibration_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        prob = row.get("model_probability")
        if row.get("settled") is None or prob is None:
            continue
        bucket_floor = int(min(9, max(0, math.floor(prob * 10)))) * 10
        buckets[f"{bucket_floor}-{bucket_floor + 10}%"].append(row)
    output = []
    for bucket in sorted(buckets, key=lambda text: int(text.split("-")[0])):
        items = buckets[bucket]
        output.append({
            "bucket": bucket,
            "n": len(items),
            "avg_model_probability": statistics.mean(item["model_probability"] for item in items),
            "actual_hit_rate": statistics.mean(int(item["settled"]) for item in items),
            "avg_edge": statistics.mean([item["edge"] for item in items if item.get("edge") is not None]) if any(item.get("edge") is not None for item in items) else None,
        })
    return output


def threshold_simulations(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    thresholds = [0.00, 0.03, 0.05, 0.08, 0.10, 0.15]
    output = []
    for market_type in ["all", "all_ex_total", "moneyline", "advance", "total", "btts", "handicap"]:
        scoped = [
            row for row in rows
            if row.get("settled") is not None
            and row.get("flat_profit_per_1") is not None
            and row.get("market_source") == "Polymarket"
            and (
                market_type == "all"
                or (market_type == "all_ex_total" and row.get("market_type") != "total")
                or row.get("market_type") == market_type
            )
        ]
        for threshold in thresholds:
            selected = [row for row in scoped if row.get("edge") is not None and row["edge"] >= threshold]
            profits = [row["flat_profit_per_1"] for row in selected]
            output.append({
                "market_type": market_type,
                "edge_threshold": threshold,
                "bets": len(selected),
                "hit_rate": statistics.mean(int(row["settled"]) for row in selected) if selected else None,
                "flat_roi": statistics.mean(profits) if profits else None,
                "avg_price": statistics.mean(row["market_price"] for row in selected if row.get("market_price") is not None) if selected else None,
            })
    return output


def sensitivity_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    for favorite_haircut in [0.0, 0.02, 0.05, 0.08]:
        adjusted = []
        for row in rows:
            copy = dict(row)
            prob = row.get("model_probability")
            price = row.get("market_price")
            if prob is not None and price is not None:
                adjusted_prob = prob
                if row.get("market_type") == "moneyline" and prob >= 0.50 and row.get("stage") != "modelled_group_window":
                    adjusted_prob = max(0.01, prob - favorite_haircut)
                copy["adjusted_edge"] = adjusted_prob - price
            adjusted.append(copy)
        for threshold in [0.03, 0.05, 0.08]:
            selected = [
                row for row in adjusted
                if row.get("settled") is not None
                and row.get("flat_profit_per_1") is not None
                and row.get("market_source") == "Polymarket"
                and row.get("adjusted_edge") is not None
                and row["adjusted_edge"] >= threshold
            ]
            output.append({
                "favorite_haircut": favorite_haircut,
                "edge_threshold": threshold,
                "bets": len(selected),
                "hit_rate": statistics.mean(int(row["settled"]) for row in selected) if selected else None,
                "flat_roi": statistics.mean(row["flat_profit_per_1"] for row in selected) if selected else None,
            })
    return output


def live_summary_rows(live_rows: list[dict[str, Any]], results_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in live_rows:
        result = results_by_id.get(row["match_id"])
        if not result:
            continue
        minute_text = str(row.get("minute") or "")
        minute_match = re.search(r"(\d+)", minute_text)
        minute = int(minute_match.group(1)) if minute_match else None
        if minute is None:
            continue
        if minute < 30:
            bucket = "0-29"
        elif minute < 60:
            bucket = "30-59"
        elif minute < 75:
            bucket = "60-74"
        else:
            bucket = "75+"
        home_score = int_or_none(row.get("home_score")) or 0
        away_score = int_or_none(row.get("away_score")) or 0
        final_home = int_or_none(result.get("regulation_home_goals")) or 0
        final_away = int_or_none(result.get("regulation_away_goals")) or 0
        buckets[bucket].append({
            **row,
            "remaining_goals": max(0, final_home + final_away - home_score - away_score),
            "current_draw": home_score == away_score,
            "final_draw": final_home == final_away,
            "leader_held": (home_score > away_score and final_home >= final_away) or (away_score > home_score and final_away >= final_home),
        })
    output = []
    for bucket in ["0-29", "30-59", "60-74", "75+"]:
        items = buckets.get(bucket, [])
        if not items:
            output.append({"minute_bucket": bucket, "snapshots": 0})
            continue
        output.append({
            "minute_bucket": bucket,
            "snapshots": len(items),
            "matches": len({item["match_id"] for item in items}),
            "any_remaining_goal_rate": statistics.mean(1 if item["remaining_goals"] > 0 else 0 for item in items),
            "avg_remaining_goals": statistics.mean(item["remaining_goals"] for item in items),
            "current_draw_final_draw_rate": statistics.mean(1 if item["final_draw"] else 0 for item in items if item["current_draw"]) if any(item["current_draw"] for item in items) else None,
            "leader_held_rate": statistics.mean(1 if item["leader_held"] else 0 for item in items if not item["current_draw"]) if any(not item["current_draw"] for item in items) else None,
        })
    return output


def result_distribution(results: list[dict[str, Any]]) -> dict[str, Any]:
    rows = [row for row in results if row.get("regulation_result_key")]
    totals = [int(row["regulation_home_goals"]) + int(row["regulation_away_goals"]) for row in rows]
    btts_values = [
        int(row["regulation_home_goals"]) > 0 and int(row["regulation_away_goals"]) > 0
        for row in rows
    ]
    return {
        "matches": len(rows),
        "home_win_rate": safe_div(sum(1 for row in rows if row["regulation_result_key"] == "home"), len(rows)),
        "draw_rate": safe_div(sum(1 for row in rows if row["regulation_result_key"] == "draw"), len(rows)),
        "away_win_rate": safe_div(sum(1 for row in rows if row["regulation_result_key"] == "away"), len(rows)),
        "over25_rate": safe_div(sum(1 for total in totals if total > 2.5), len(totals)),
        "under25_rate": safe_div(sum(1 for total in totals if total < 2.5), len(totals)),
        "btts_rate": safe_div(sum(1 for value in btts_values if value), len(btts_values)),
        "avg_goals": statistics.mean(totals) if totals else None,
        "extra_or_pen_count": sum(1 for row in rows if "AET" in str(row.get("status_name")) or "PEN" in str(row.get("status_name"))),
    }


def markdown_table(rows: list[dict[str, Any]], columns: list[tuple[str, str]], limit: int | None = None) -> str:
    scoped = rows[:limit] if limit else rows
    if not scoped:
        return "_无数据_"
    lines = []
    lines.append("| " + " | ".join(label for _, label in columns) + " |")
    lines.append("| " + " | ".join("---" for _ in columns) + " |")
    for row in scoped:
        cells = []
        for key, _ in columns:
            value = row.get(key)
            if isinstance(value, float):
                if "rate" in key or "probability" in key or "threshold" in key or "haircut" in key or key in ("edge_threshold",):
                    cells.append(fmt_pct(value))
                else:
                    cells.append(fmt_num(value))
            elif value is None:
                cells.append("-")
            else:
                cells.append(str(value))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def write_reports(
    out_dir: Path,
    audit: dict[str, Any],
    distribution_all: dict[str, Any],
    distribution_modelled: dict[str, Any],
    by_market: list[dict[str, Any]],
    by_stage: list[dict[str, Any]],
    calibration: list[dict[str, Any]],
    threshold_rows_: list[dict[str, Any]],
    sensitivity: list[dict[str, Any]],
    live_rows_: list[dict[str, Any]],
    factor_rows: list[dict[str, Any]],
    missing_rows: list[dict[str, Any]],
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    generated_at = dt.datetime.now(dt.timezone.utc).astimezone(dt.timezone(dt.timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S %z")
    price_point_note = (
        f"The `price_points` table has {audit['price_points']} rows, so normalized curve analysis can use that table after market-key validation."
        if audit["price_points"]
        else "The `price_points` table is empty, so curve-level analysis currently uses archived market snapshots, not normalized tick-by-tick curves."
    )
    total_row = next((row for row in by_market if row.get("market_type") == "total"), {})
    total_warning = ""
    if total_row and (total_row.get("flat_roi") or 0) > 0.4:
        total_warning = (
            "\n\n> **Data QA warning:** total/大小球 rows show unusually strong flat ROI. "
            "Because historical UI issues included very low captured Under prices, treat this as a market-token/price-mapping QA signal first, not as a deployable model edge. "
            "Use the `all_ex_total` sensitivity rows for broad strategy review until total prices are independently validated.\n"
        )

    audit_md = f"""# World Cup Research Data Audit

Generated: {generated_at}

## Coverage

- DB schedule matches with prediction context: **{audit['matches']}**
- Selected pre-match snapshots: **{audit['selected_snapshots']}**
- DB result rows joined to modelled matches: **{audit['joined_results']} / {audit['matches']}**
- ESPN public final-score rows fetched: **{audit['espn_results']}**
- Market rows at selected snapshots: **{audit['market_rows']}**
- Settled market rows after result join: **{audit['settled_market_rows']}**
- Live snapshots: **{audit['live_snapshots']}**
- Synced/post live snapshots: **{audit['synced_live_snapshots']}**
- Price-points table rows: **{audit['price_points']}**
- Top-holder snapshot rows: **{audit['top_holder_rows']}**

## Result Backfill

- ESPN candidates matching archived modelled matches: **{audit['backfill']['candidate_count']}**
- Already present before this run: **{audit['backfill']['existing_count']}**
- Backfilled this run: **{audit['backfill']['to_write_count']}**
- DB write enabled: **{audit['backfill']['written']}**

## Remaining Gaps

{markdown_table(missing_rows, [
    ('match_id', 'match_id'),
    ('home_name', 'home'),
    ('away_name', 'away'),
    ('kickoff_shanghai', 'kickoff'),
    ('gap', 'gap'),
], limit=40)}

## Interpretation

1. The research-grade sample is now the set of modelled schedule matches that have a verified 90-minute result.
2. ESPN provides final match facts, but AET/PEN matches need two labels: 90-minute result for moneyline/totals/BTTS, advancement result for Team to Advance.
3. {price_point_note}
4. Live analysis is useful but limited: only synced/post live snapshots should be used for in-play factor claims.
{total_warning}
"""
    write_markdown(out_dir / "worldcup-data-audit.md", audit_md)

    descriptive_md = f"""# World Cup Descriptive Analysis

Generated: {generated_at}

## Tournament Result Distribution

| Sample | Matches | Home win | Draw | Away win | Over 2.5 | Under 2.5 | BTTS | Avg goals | AET/PEN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ESPN completed events | {distribution_all['matches']} | {fmt_pct(distribution_all['home_win_rate'])} | {fmt_pct(distribution_all['draw_rate'])} | {fmt_pct(distribution_all['away_win_rate'])} | {fmt_pct(distribution_all['over25_rate'])} | {fmt_pct(distribution_all['under25_rate'])} | {fmt_pct(distribution_all['btts_rate'])} | {fmt_num(distribution_all['avg_goals'])} | {distribution_all['extra_or_pen_count']} |
| Modelled archive sample | {distribution_modelled['matches']} | {fmt_pct(distribution_modelled['home_win_rate'])} | {fmt_pct(distribution_modelled['draw_rate'])} | {fmt_pct(distribution_modelled['away_win_rate'])} | {fmt_pct(distribution_modelled['over25_rate'])} | {fmt_pct(distribution_modelled['under25_rate'])} | {fmt_pct(distribution_modelled['btts_rate'])} | {fmt_num(distribution_modelled['avg_goals'])} | {distribution_modelled['extra_or_pen_count']} |

## Market-Type Performance

{markdown_table(by_market, [
    ('market_type', 'market'),
    ('settled', 'settled'),
    ('hit_rate', 'hit rate'),
    ('avg_model_probability', 'avg model'),
    ('brier', 'Brier'),
    ('log_loss', 'Log loss'),
    ('flat_roi', '$1 flat ROI'),
])}

## Stage Performance

{markdown_table(by_stage, [
    ('stage', 'stage'),
    ('settled', 'settled rows'),
    ('hit_rate', 'hit rate'),
    ('avg_model_probability', 'avg model'),
    ('brier', 'Brier'),
    ('flat_roi', '$1 flat ROI'),
])}

## Calibration Buckets

{markdown_table(calibration, [
    ('bucket', 'model bucket'),
    ('n', 'n'),
    ('avg_model_probability', 'avg model'),
    ('actual_hit_rate', 'actual hit'),
    ('avg_edge', 'avg edge'),
])}

## First Read

- Use Brier/log-loss for probability quality, not just hit rate. A row can have low hit rate if it is a longshot, but still be well-calibrated.
- The strongest descriptive warning is whether high model probabilities actually hit at the expected rate. If high-probability favorites underperform in the knockout sample, ranking/favorite priors should be reduced there.
- The modelled sample is still modest. Treat large ROI values on thin low-price rows as unstable until reviewed by market type and match context.
{total_warning}
"""
    write_markdown(out_dir / "worldcup-descriptive-analysis.md", descriptive_md)

    factor_md = f"""# World Cup Factor Analysis

Generated: {generated_at}

## Simple Factor Signals

{markdown_table(factor_rows, [
    ('factor', 'factor'),
    ('scope', 'scope'),
    ('n', 'n'),
    ('low_hit_rate', 'low hit'),
    ('high_hit_rate', 'high hit'),
    ('lift', 'lift'),
    ('correlation', 'corr'),
])}

## Live-State Summary

{markdown_table(live_rows_, [
    ('minute_bucket', 'minute'),
    ('snapshots', 'snapshots'),
    ('matches', 'matches'),
    ('any_remaining_goal_rate', 'any later goal'),
    ('avg_remaining_goals', 'avg later goals'),
    ('current_draw_final_draw_rate', 'draw stays draw'),
    ('leader_held_rate', 'leader held'),
])}

## Interpretation

- `edge` should not be treated as automatically profitable; it must be tested against settlement and price.
- `market_price` is a strong prior, but using it too heavily risks turning the model into the market. The useful test is whether model-market disagreement has positive realized value.
- In-play factors need stricter evidence gates. The live sample is much smaller than the pre-match archive, so it can suggest hypotheses, not final rules.
- Holder/elite-account effects should be analyzed as a separate wallet dataset next, because top-holder snapshots are large and can distort match-level analysis if joined naively.
"""
    write_markdown(out_dir / "worldcup-factor-analysis.md", factor_md)

    sensitivity_md = f"""# World Cup Sensitivity Analysis

Generated: {generated_at}

## Edge Threshold Simulation

Flat $1 per historical candidate, Polymarket rows only. This is a research backtest, not a trading instruction.

{markdown_table(threshold_rows_, [
    ('market_type', 'market'),
    ('edge_threshold', 'edge >='),
    ('bets', 'bets'),
    ('hit_rate', 'hit rate'),
    ('flat_roi', '$1 flat ROI'),
    ('avg_price', 'avg price'),
])}

## Broad Simulation Excluding Totals

This removes total/大小球 rows until their historical price direction is validated.

{markdown_table([row for row in threshold_rows_ if row.get('market_type') == 'all_ex_total'], [
    ('edge_threshold', 'edge >='),
    ('bets', 'bets'),
    ('hit_rate', 'hit rate'),
    ('flat_roi', '$1 flat ROI'),
    ('avg_price', 'avg price'),
])}

## Knockout Favorite Haircut Sensitivity

This applies a simple haircut to knockout moneyline favorites before selecting positive-edge rows. It tests whether the model was too generous to favorites.

{markdown_table(sensitivity, [
    ('favorite_haircut', 'favorite haircut'),
    ('edge_threshold', 'edge >='),
    ('bets', 'bets'),
    ('hit_rate', 'hit rate'),
    ('flat_roi', '$1 flat ROI'),
])}

## Interpretation

- If ROI improves after favorite haircuts, the next model change should reduce favorite/ranking priors in knockout games.
- If ROI only appears at extremely low prices, inspect whether prices were real Polymarket rows or mapping artifacts before trusting the signal.
- If a threshold has very few bets, use it as a case-study filter, not as a deployable rule.
{total_warning}
"""
    write_markdown(out_dir / "worldcup-sensitivity-analysis.md", sensitivity_md)

    combined = f"""# World Cup Prediction Research Report

Generated: {generated_at}

## Executive Summary

I backfilled modelled World Cup match results from ESPN where available, keeping 90-minute results separate from advancement results for AET/PEN matches. The first reliable research layer is now:

- **{audit['matches']}** archived schedule matches with prediction context.
- **{audit['joined_results']}** modelled matches with joined results after backfill.
- **{audit['settled_market_rows']}** settled market rows at the selected pre-match snapshot.
- **{audit['synced_live_snapshots']}** synced/post live snapshots for in-play review.

The dataset is now good enough for a first descriptive and factor report, but not yet enough to make aggressive live-trading conclusions. Live data coverage is the bottleneck.

## Main Findings

1. **Result alignment was the biggest issue.** Late knockout results were not all recorded in `match_results`; ESPN can backfill them.
2. **AET/PEN must be split.** 90-minute markets and advancement markets settle differently. The new backfill payload preserves both.
3. **Market analysis is possible.** Moneyline, total, BTTS, handicap, and advance rows have model probability, price, edge, and settlement labels.
4. **Curve analysis still needs validation.** {price_point_note}
5. **Live strategy analysis is sample-limited.** Live snapshots exist, but only a small number are synced/post quality.

## Key Tables

### Market-Type Performance

{markdown_table(by_market, [
    ('market_type', 'market'),
    ('settled', 'settled'),
    ('hit_rate', 'hit rate'),
    ('avg_model_probability', 'avg model'),
    ('brier', 'Brier'),
    ('flat_roi', '$1 flat ROI'),
])}

### Sensitivity Snapshot

{markdown_table([row for row in threshold_rows_ if row.get('market_type') == 'all_ex_total'], [
    ('edge_threshold', 'edge >='),
    ('bets', 'bets'),
    ('hit_rate', 'hit rate'),
    ('flat_roi', '$1 flat ROI'),
    ('avg_price', 'avg price'),
])}

## Recommended Next Research Steps

1. Rebuild normalized price history from archived `market_snapshots`, then test entry timing and closing-line value.
2. Build a wallet/holder factor table separately from match-level rows: current holder, elite-account classification, hedge/arbitrage filter, and final settlement.
3. Add post-16-team factor tests for physical mismatch, goalkeeper proxy, age/fatigue, and media-score consensus once those fields are consistently archived.
4. Only after those reports are stable should the prediction engine weights be changed.

Detailed reports:

- `worldcup-data-audit.md`
- `worldcup-descriptive-analysis.md`
- `worldcup-factor-analysis.md`
- `worldcup-background-factor-analysis-zh.md`
- `worldcup-live-factor-analysis-zh.md`
- `worldcup-sensitivity-analysis.md`
"""
    write_markdown(out_dir / "worldcup-research-report.md", combined)

    combined_zh = f"""# 世界杯预测研究报告

生成时间：{generated_at}

## 核心结论

这次我先把服务器历史库里的世界杯预测样本补齐了结果，并且把淘汰赛的两个口径分开：

- **90 分钟结果**：用于胜平负、大小球、双方进球、让球。
- **晋级结果**：用于 `Team to Advance`，包含加时和点球后的晋级方。

当前可以研究的核心样本：

- 有预测上下文的比赛：**{audit['matches']}** 场。
- 已对齐最终结果的比赛：**{audit['joined_results']}** 场。
- 可结算的赛前盘口行：**{audit['settled_market_rows']}** 行。
- 可用于现场分析的同步/赛后现场快照：**{audit['synced_live_snapshots']}** 条。
- ESPN 完整比分样本：**{distribution_all['matches']}** 场。

## 最重要发现

1. **之前最大的问题是结果没补齐。** 现在 52 场有预测的比赛已经全部对齐结果。
2. **淘汰赛不能把晋级结果当成 90 分钟胜负。** 加时/点球比赛已经拆成 regulation 和 advance 两套标签。
3. **原始 edge 不能直接拿来优化预测。** 排除大小球后，正 edge 回测整体还是负的，说明模型-market 分歧本身还不够可靠。
4. **大小球看起来有正收益，但先不能信。** 历史里出现过很低的 Under 价格，说明 total 盘口需要先做 token/价格方向校验。
5. **现场策略还不能下重结论。** 现场快照有数据，但真正高质量同步样本还是偏少，只能先做方向性复盘。

## 结果分布

| 样本 | 场次 | 主胜 | 平局 | 客胜 | 大 2.5 | 小 2.5 | 双方进球 | 场均进球 | 加时/点球 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ESPN 完整赛事 | {distribution_all['matches']} | {fmt_pct(distribution_all['home_win_rate'])} | {fmt_pct(distribution_all['draw_rate'])} | {fmt_pct(distribution_all['away_win_rate'])} | {fmt_pct(distribution_all['over25_rate'])} | {fmt_pct(distribution_all['under25_rate'])} | {fmt_pct(distribution_all['btts_rate'])} | {fmt_num(distribution_all['avg_goals'])} | {distribution_all['extra_or_pen_count']} |
| 平台预测样本 | {distribution_modelled['matches']} | {fmt_pct(distribution_modelled['home_win_rate'])} | {fmt_pct(distribution_modelled['draw_rate'])} | {fmt_pct(distribution_modelled['away_win_rate'])} | {fmt_pct(distribution_modelled['over25_rate'])} | {fmt_pct(distribution_modelled['under25_rate'])} | {fmt_pct(distribution_modelled['btts_rate'])} | {fmt_num(distribution_modelled['avg_goals'])} | {distribution_modelled['extra_or_pen_count']} |

## 各盘口回测

{markdown_table(by_market, [
    ('market_type', '盘口'),
    ('settled', '结算行'),
    ('hit_rate', '命中率'),
    ('avg_model_probability', '模型均值'),
    ('brier', 'Brier'),
    ('flat_roi', '$1 平注 ROI'),
])}

## 排除大小球后的 edge 敏感性

这张表更适合作为下一步优化参考，因为它先排除了 total/大小球价格映射疑点。

{markdown_table([row for row in threshold_rows_ if row.get('market_type') == 'all_ex_total'], [
    ('edge_threshold', 'edge >='),
    ('bets', '候选数'),
    ('hit_rate', '命中率'),
    ('flat_roi', '$1 平注 ROI'),
    ('avg_price', '均价'),
])}

## 因子信号

{markdown_table(factor_rows, [
    ('factor', '因子'),
    ('scope', '范围'),
    ('n', '样本'),
    ('low_hit_rate', '低组命中'),
    ('high_hit_rate', '高组命中'),
    ('lift', '提升'),
    ('correlation', '相关'),
])}

## 现场数据

{markdown_table(live_rows_, [
    ('minute_bucket', '分钟段'),
    ('snapshots', '快照'),
    ('matches', '比赛'),
    ('any_remaining_goal_rate', '后续仍有进球'),
    ('avg_remaining_goals', '后续场均进球'),
    ('current_draw_final_draw_rate', '平局保持'),
    ('leader_held_rate', '领先保持'),
])}

## 对预测优化的启示

1. **先修数据，不先改权重。** 大小球价格映射和 `price_points` 归一化是第一优先级。
2. **降低“裸 edge”权重。** moneyline、BTTS、advance 的高 edge 组在当前样本里没有表现更好。
3. **淘汰赛继续保留平局/加时路径。** 9 场 ESPN 样本进入加时或点球，不能只看强队 90 分钟胜。
4. **现场模型要按分钟段分层。** 75 分钟后仍有后续进球，但样本显示领先保持率和最后进球概率都需要结合现场压制质量，而不是只看比分。
5. **高手/持仓因子下一步单独做。** 服务器有 215 万条 top-holder 快照，不能直接和比赛行硬 join，要单独做钱包级别清洗。

## 下一步建议

1. 重建 Polymarket 标准化价格曲线，尤其是大小球 Yes/No/token 方向。
2. 单独做 top-holder / elite wallet 的结算表现表。
3. 把 16 强后的身体对抗、门将、年龄、体能、媒体比分共识做成可检验因子。
4. 只有当这些因子通过回测，才进入预测模型权重。
"""
    write_markdown(out_dir / "worldcup-research-report-zh.md", combined_zh)


def top_factor_rows(rows: list[dict[str, Any]], target: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
    scoped = [row for row in rows if (target is None or row.get("target") == target) and row.get("lift") is not None]
    return sorted(scoped, key=lambda row: abs(float(row.get("lift") or 0)), reverse=True)[:limit]


def write_background_live_factor_reports(
    out_dir: Path,
    background_rows: list[dict[str, Any]],
    background_signals: list[dict[str, Any]],
    live_rows_: list[dict[str, Any]],
    live_signals: list[dict[str, Any]],
) -> None:
    generated_at = dt.datetime.now(dt.timezone.utc).astimezone(dt.timezone(dt.timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S %z")
    background_missing_notes = []
    for factor in [
        "height_diff_home", "age_diff_home", "gk_score_diff_home", "form_points_diff_home",
        "wc_appearances_diff_home", "h2h_goal_total_per_match", "context_draw_delta",
    ]:
        present = sum(1 for row in background_rows if row.get(factor) is not None)
        background_missing_notes.append({
            "factor": factor,
            "available": present,
            "coverage": present / len(background_rows) if background_rows else None,
        })

    background_md = f"""# 背景数据因子分析

生成时间：{generated_at}

## 这版和上一版的区别

上一版主要是盘口行诊断：看模型概率、盘口价格、edge 和最终结算。
这一版分析的是**赛前背景数据本身**：球队强弱、近况、身体/年龄/门将代理、世界杯履历、20年交手、动态情报修正，这些因素和最终盘口结果之间有没有关系。

样本：**{len(background_rows)}** 场有预测和结果的世界杯比赛。
方法：对每个连续因子按中位数切成“低组/高组”，比较目标盘口结果的命中率差异。样本小，所以这是解释性因子筛选，不是最终模型。

## 胜平负/强弱方向

{markdown_table(top_factor_rows(background_signals, "home_win", 10), [
    ('label', '因子解释'),
    ('n', '样本'),
    ('median', '中位数'),
    ('low_rate', '低组命中'),
    ('high_rate', '高组命中'),
    ('lift', '高低差'),
    ('correlation', '相关'),
])}

## 平局/接近程度

{markdown_table(top_factor_rows(background_signals, "draw", 8), [
    ('label', '因子解释'),
    ('n', '样本'),
    ('median', '中位数'),
    ('low_rate', '低组命中'),
    ('high_rate', '高组命中'),
    ('lift', '高低差'),
    ('correlation', '相关'),
])}

## 大小球

{markdown_table(top_factor_rows(background_signals, "over25", 10), [
    ('label', '因子解释'),
    ('n', '样本'),
    ('median', '中位数'),
    ('low_rate', '低组命中'),
    ('high_rate', '高组命中'),
    ('lift', '高低差'),
    ('correlation', '相关'),
])}

## 双方进球

{markdown_table(top_factor_rows(background_signals, "btts", 10), [
    ('label', '因子解释'),
    ('n', '样本'),
    ('median', '中位数'),
    ('low_rate', '低组命中'),
    ('high_rate', '高组命中'),
    ('lift', '高低差'),
    ('correlation', '相关'),
])}

## 数据覆盖

{markdown_table(background_missing_notes, [
    ('factor', '因子'),
    ('available', '可用场次'),
    ('coverage', '覆盖率'),
])}

## 初步判断

1. 能进入预测模型的因子必须满足两个条件：覆盖率够高，并且方向在多个盘口目标上不互相矛盾。
2. 身高、年龄、门将/防线代理这些因子如果覆盖率不足，只能作为淘汰赛人工复核项，不能一上来重权重。
3. `xG总量、近期进失球开放度、动态BTTS/Over修正` 应该优先用于大小球/BTTS，而不是硬塞进胜平负。
4. `xG接近程度、身体对抗平局修正、淘汰赛阶段` 更适合影响平局/加时路径。
"""
    write_markdown(out_dir / "worldcup-background-factor-analysis-zh.md", background_md)

    live_quality = Counter(str(row.get("data_quality") or "unknown") for row in live_rows_)
    live_quality_rows = [{"quality": key, "rows": value} for key, value in sorted(live_quality.items())]
    live_md = f"""# 现场数据因子分析

生成时间：{generated_at}

## 分析目标

这份报告分析的是**比赛进行中看到的数据**如何影响最终盘口结果：
当前比分、分钟、射门、射正、角球、控球、压力差，分别对应后续进球、大小球、BTTS、领先是否守住。

样本：**{len(live_rows_)}** 条能和最终结果对齐的现场快照。
注意：现场数据比赛级别样本仍然偏少，所以它适合做规则门槛和复盘，不适合直接训练复杂模型。

## 现场后续进球

{markdown_table(top_factor_rows(live_signals, "any_later_goal", 10), [
    ('label', '因子解释'),
    ('n', '样本'),
    ('median', '中位数'),
    ('low_rate', '低组命中'),
    ('high_rate', '高组命中'),
    ('lift', '高低差'),
    ('correlation', '相关'),
])}

## 领先是否守住

{markdown_table(top_factor_rows(live_signals, "leader_held", 8), [
    ('label', '因子解释'),
    ('n', '样本'),
    ('median', '中位数'),
    ('low_rate', '低组命中'),
    ('high_rate', '高组命中'),
    ('lift', '高低差'),
    ('correlation', '相关'),
])}

## 平局是否保持

{markdown_table(top_factor_rows(live_signals, "draw_stayed", 8), [
    ('label', '因子解释'),
    ('n', '样本'),
    ('median', '中位数'),
    ('low_rate', '低组命中'),
    ('high_rate', '高组命中'),
    ('lift', '高低差'),
    ('correlation', '相关'),
])}

## 现场压力方向

{markdown_table(top_factor_rows(live_signals, "later_goal_home_edge", 10), [
    ('label', '因子解释'),
    ('n', '样本'),
    ('median', '中位数'),
    ('low_rate', '低组命中'),
    ('high_rate', '高组命中'),
    ('lift', '高低差'),
    ('correlation', '相关'),
])}

## 现场数据质量

{markdown_table(live_quality_rows, [
    ('quality', '数据质量'),
    ('rows', '快照数'),
])}

## 初步判断

1. 现场推荐不能只看“强队还没进”。必须同时看分钟、射正、射门、角球和压力差。
2. 如果 60 分钟后仍是平局，平局/低比分路径需要保留，但只有在射正和危险压力持续偏向一方时，才允许小仓保留一球路径。
3. 领先方是否守住不能只看领先比分，要看领先方是否还在制造压力；如果领先方被压着打，止盈/保护优先级应该提高。
4. 现场正确比分组合应该从“当前比分邻近路径 + 压力方向 + 剩余时间”生成，而不是固定模板。
"""
    write_markdown(out_dir / "worldcup-live-factor-analysis-zh.md", live_md)


def factor_signal_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    settled = [row for row in rows if row.get("settled") is not None]
    specs = [
        ("edge", "all"),
        ("market_price", "all"),
        ("model_probability", "all"),
        ("completeness_score", "all"),
        ("edge", "moneyline"),
        ("edge", "total"),
        ("edge", "btts"),
        ("edge", "advance"),
    ]
    output = []
    for factor, scope in specs:
        scoped = [
            row for row in settled
            if (scope == "all" or row.get("market_type") == scope)
            and row.get(factor) is not None
        ]
        if len(scoped) < 8:
            continue
        values = [float(row[factor]) for row in scoped]
        median = statistics.median(values)
        low = [row for row in scoped if float(row[factor]) <= median]
        high = [row for row in scoped if float(row[factor]) > median]
        low_hit = statistics.mean(int(row["settled"]) for row in low) if low else None
        high_hit = statistics.mean(int(row["settled"]) for row in high) if high else None
        output.append({
            "factor": factor,
            "scope": scope,
            "n": len(scoped),
            "low_hit_rate": low_hit,
            "high_hit_rate": high_hit,
            "lift": (high_hit - low_hit) if high_hit is not None and low_hit is not None else None,
            "correlation": pearson(values, [int(row["settled"]) for row in scoped]),
        })
    return output


def univariate_factor_rows(
    rows: list[dict[str, Any]],
    specs: list[tuple[str, str, str]],
    min_n: int = 8,
) -> list[dict[str, Any]]:
    output = []
    for factor, target, label in specs:
        scoped = [
            row for row in rows
            if row.get(factor) is not None
            and row.get(target) is not None
        ]
        values = []
        for row in scoped:
            try:
                value = float(row[factor])
                target_value = int(row[target])
                if math.isfinite(value):
                    values.append((value, target_value))
            except Exception:
                continue
        if len(values) < min_n:
            continue
        median = statistics.median(value for value, _ in values)
        low = [(value, target_value) for value, target_value in values if value <= median]
        high = [(value, target_value) for value, target_value in values if value > median]
        if not low or not high:
            continue
        low_rate = statistics.mean(target for _, target in low)
        high_rate = statistics.mean(target for _, target in high)
        corr = pearson([value for value, _ in values], [target for _, target in values])
        output.append({
            "factor": factor,
            "label": label,
            "target": target,
            "n": len(values),
            "median": median,
            "low_rate": low_rate,
            "high_rate": high_rate,
            "lift": high_rate - low_rate,
            "correlation": corr,
            "direction": "positive" if high_rate > low_rate else "negative" if high_rate < low_rate else "flat",
        })
    return output


def background_factor_signals(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    specs = [
        ("xg_diff_home", "home_win", "xG差越偏主队，主队90分钟胜是否提高"),
        ("xg_abs_diff", "favorite_win", "赛前强弱差越大，模型热门是否赢"),
        ("xg_balance", "draw", "双方越接近，平局是否提高"),
        ("xg_total", "over25", "赛前总xG越高，大2.5是否提高"),
        ("xg_total", "btts", "赛前总xG越高，双方进球是否提高"),
        ("form_points_diff_home", "home_win", "近况积分率差越偏主队，主队胜是否提高"),
        ("form_gf_diff_home", "home_win", "近期进球能力差越偏主队，主队胜是否提高"),
        ("form_ga_diff_home", "away_win", "主队近期失球更多，客队胜是否提高"),
        ("form_total_goals", "over25", "两队近期进失球越开放，大2.5是否提高"),
        ("form_total_goals", "btts", "两队近期进失球越开放，双方进球是否提高"),
        ("height_diff_home", "home_win", "身高差越偏主队，主队胜是否提高"),
        ("height_diff_home", "btts", "身高差越大方向偏主队，双方进球是否变化"),
        ("age_diff_home", "home_win", "年龄差越偏主队，主队胜是否提高"),
        ("gk_score_diff_home", "home_win", "门将代理差越偏主队，主队胜是否提高"),
        ("df_score_diff_home", "under25", "防线代理差越偏主队，小2.5是否提高"),
        ("mf_score_diff_home", "home_win", "中场代理差越偏主队，主队胜是否提高"),
        ("fw_score_diff_home", "home_win", "锋线代理差越偏主队，主队胜是否提高"),
        ("wc_appearances_diff_home", "home_win", "世界杯经验差越偏主队，主队胜是否提高"),
        ("wc_titles_diff_home", "home_win", "冠军履历差越偏主队，主队胜是否提高"),
        ("wc_win_rate_diff_home", "home_win", "世界杯历史胜率差越偏主队，主队胜是否提高"),
        ("h2h_goal_total_per_match", "over25", "20年交手进球越多，大2.5是否提高"),
        ("group_delta_diff_home", "home_win", "小组/路径动机修正越偏主队，主队胜是否提高"),
        ("physical_delta_diff_home", "home_win", "身体对抗修正越偏主队，主队胜是否提高"),
        ("physical_draw_delta", "draw", "身体对抗触发平局修正，平局是否提高"),
        ("context_diff_home", "home_win", "综合动态信号越偏主队，主队胜是否提高"),
        ("context_btts_delta", "btts", "动态BTTS修正越高，双方进球是否提高"),
        ("context_over25_delta", "over25", "动态大球修正越高，大2.5是否提高"),
        ("context_draw_delta", "draw", "动态平局修正越高，平局是否提高"),
    ]
    return univariate_factor_rows(rows, specs, min_n=8)


def minute_number(value: Any) -> int | None:
    text = str(value or "")
    match = re.search(r"(\d+)", text)
    if not match:
        return None
    return int(match.group(1))


def live_feature_rows(
    live_rows: list[dict[str, Any]],
    matches_by_id: dict[str, dict[str, Any]],
    results_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    output = []
    for row in live_rows:
        if row.get("data_quality") not in ("synced", "post"):
            continue
        match = matches_by_id.get(row["match_id"])
        result = results_by_id.get(row["match_id"])
        if not match or not result:
            continue
        minute = minute_number(row.get("minute"))
        if minute is None:
            continue
        home_score = int_or_none(row.get("home_score")) or 0
        away_score = int_or_none(row.get("away_score")) or 0
        final_home = int_or_none(result.get("regulation_home_goals")) or 0
        final_away = int_or_none(result.get("regulation_away_goals")) or 0
        home_shots = int_or_none(row.get("home_shots"))
        away_shots = int_or_none(row.get("away_shots"))
        home_sot = int_or_none(row.get("home_sot"))
        away_sot = int_or_none(row.get("away_sot"))
        home_corners = int_or_none(row.get("home_corners"))
        away_corners = int_or_none(row.get("away_corners"))
        home_possession = row.get("home_possession")
        away_possession = row.get("away_possession")
        try:
            home_possession = float(home_possession) if home_possession is not None else None
            away_possession = float(away_possession) if away_possession is not None else None
        except Exception:
            home_possession = None
            away_possession = None
        score_diff = home_score - away_score
        later_home_goals = max(0, final_home - home_score)
        later_away_goals = max(0, final_away - away_score)
        shot_diff = home_shots - away_shots if home_shots is not None and away_shots is not None else None
        sot_diff = home_sot - away_sot if home_sot is not None and away_sot is not None else None
        corner_diff = home_corners - away_corners if home_corners is not None and away_corners is not None else None
        possession_diff = home_possession - away_possession if home_possession is not None and away_possession is not None else None
        pressure_diff = None
        if any(value is not None for value in (shot_diff, sot_diff, corner_diff, possession_diff)):
            pressure_diff = (
                (shot_diff or 0) * 0.35
                + (sot_diff or 0) * 1.1
                + (corner_diff or 0) * 0.35
                + (possession_diff or 0) * 0.03
            )
        leader_side = "home" if score_diff > 0 else "away" if score_diff < 0 else "draw"
        if leader_side == "home":
            leader_pressure = pressure_diff
            leader_held = 1 if final_home >= final_away else 0
        elif leader_side == "away":
            leader_pressure = -pressure_diff if pressure_diff is not None else None
            leader_held = 1 if final_away >= final_home else 0
        else:
            leader_pressure = None
            leader_held = None
        output.append({
            "match_id": row["match_id"],
            "match": f"{match.get('home_name')} vs {match.get('away_name')}",
            "captured_at": row.get("captured_at"),
            "minute": minute,
            "data_quality": row.get("data_quality"),
            "home_score": home_score,
            "away_score": away_score,
            "current_total_goals": home_score + away_score,
            "score_diff_home": score_diff,
            "abs_score_diff": abs(score_diff),
            "current_draw": 1 if score_diff == 0 else 0,
            "current_btts": 1 if home_score > 0 and away_score > 0 else 0,
            "home_shots": home_shots,
            "away_shots": away_shots,
            "shots_total": (home_shots + away_shots) if home_shots is not None and away_shots is not None else None,
            "shot_diff_home": shot_diff,
            "sot_total": (home_sot + away_sot) if home_sot is not None and away_sot is not None else None,
            "sot_diff_home": sot_diff,
            "corners_total": (home_corners + away_corners) if home_corners is not None and away_corners is not None else None,
            "corner_diff_home": corner_diff,
            "possession_diff_home": possession_diff,
            "pressure_diff_home": pressure_diff,
            "leader_pressure": leader_pressure,
            "remaining_goals": later_home_goals + later_away_goals,
            "any_later_goal": 1 if later_home_goals + later_away_goals > 0 else 0,
            "later_goal_home_edge": 1 if later_home_goals > later_away_goals else 0,
            "final_home_win": 1 if final_home > final_away else 0,
            "final_away_win": 1 if final_away > final_home else 0,
            "final_draw": 1 if final_home == final_away else 0,
            "final_over25": 1 if final_home + final_away > 2.5 else 0,
            "final_btts": 1 if final_home > 0 and final_away > 0 else 0,
            "leader_held": leader_held,
            "draw_stayed": 1 if score_diff == 0 and final_home == final_away else 0 if score_diff == 0 else None,
        })
    return output


def live_factor_signals(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    specs = [
        ("minute", "any_later_goal", "分钟越晚，后续仍有进球是否下降"),
        ("minute", "draw_stayed", "平局时分钟越晚，平局是否更能保持"),
        ("current_total_goals", "final_over25", "当前进球越多，最终大2.5是否提高"),
        ("current_total_goals", "any_later_goal", "当前进球越多，后续是否仍有进球"),
        ("current_btts", "final_btts", "当前已经双进，最终BTTS是否锁定"),
        ("shots_total", "any_later_goal", "现场射门总量越高，后续进球是否提高"),
        ("sot_total", "any_later_goal", "现场射正总量越高，后续进球是否提高"),
        ("corners_total", "any_later_goal", "角球总量越高，后续进球是否提高"),
        ("abs_score_diff", "leader_held", "领先优势越大，领先方是否守住"),
        ("leader_pressure", "leader_held", "领先方仍有压力优势，领先是否更稳"),
        ("pressure_diff_home", "later_goal_home_edge", "主队现场压力越高，后续主队净进球是否更好"),
        ("shot_diff_home", "later_goal_home_edge", "主队射门差越高，后续主队净进球是否更好"),
        ("sot_diff_home", "later_goal_home_edge", "主队射正差越高，后续主队净进球是否更好"),
        ("corner_diff_home", "later_goal_home_edge", "主队角球差越高，后续主队净进球是否更好"),
        ("possession_diff_home", "later_goal_home_edge", "主队控球差越高，后续主队净进球是否更好"),
    ]
    return univariate_factor_rows(rows, specs, min_n=8)


def result_rows_for_modelled(matches: list[dict[str, Any]], results_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for match in matches:
        result = results_by_id.get(match["match_id"])
        if not result:
            continue
        rows.append({
            "match_id": match["match_id"],
            "date": match.get("kickoff_shanghai") or "",
            "home_name": match.get("home_name") or "",
            "away_name": match.get("away_name") or "",
            "regulation_home_goals": int_or_none(result.get("regulation_home_goals")) or 0,
            "regulation_away_goals": int_or_none(result.get("regulation_away_goals")) or 0,
            "regulation_result_key": result.get("regulation_result_key"),
            "status_name": parse_json(result.get("payload_json")).get("espn", {}).get("statusName") if result.get("payload_json") else "",
        })
    return rows


def db_scalar(conn: sqlite3.Connection, sql: str) -> int:
    try:
        value = conn.execute(sql).fetchone()[0]
        return int(value or 0)
    except Exception:
        return 0


def run() -> None:
    args = parse_args()
    db_path = Path(args.db)
    out_dir = Path(args.out)
    tables_dir = out_dir / "tables"
    tables_dir.mkdir(parents=True, exist_ok=True)
    if not db_path.exists():
        raise SystemExit(f"DB not found: {db_path}")

    conn = connect(str(db_path))
    matches = load_matches(conn)
    espn_results = load_espn_results(out_dir, args.fetch_espn or args.backfill_results)
    backfill = {"candidate_count": 0, "existing_count": 0, "to_write_count": 0, "written": False, "ids": []}
    if args.backfill_results:
        backfill = backfill_results(conn, matches, espn_results, args.write_db, args.refresh_existing)

    results_by_id = load_results(conn)
    snapshots = load_match_snapshots(conn)
    selected_by_match = select_prematch_snapshots(matches, snapshots)
    selected_snapshots = list(selected_by_match.values())
    snapshots_by_id = {snapshot["snapshot_id"]: snapshot for snapshot in selected_snapshots}
    matches_by_id = {match["match_id"]: match for match in matches}
    market_rows = load_markets_for_snapshots(conn, list(snapshots_by_id))
    enriched_markets = enrich_market_rows(market_rows, matches_by_id, results_by_id, snapshots_by_id)
    settled_rows = [row for row in enriched_markets if row.get("settled") is not None]

    live_rows = load_live_snapshots(conn)
    inplay_rows = load_inplay_recommendations(conn)
    background_rows = background_feature_rows(conn, matches, selected_by_match, results_by_id)
    background_signals = background_factor_signals(background_rows)
    live_feature_dataset = live_feature_rows(live_rows, matches_by_id, results_by_id)
    live_signals = live_factor_signals(live_feature_dataset)
    modelled_result_rows = result_rows_for_modelled(matches, results_by_id)
    espn_public_rows = [
        {
            **row,
            "regulation_result_key": row.get("regulation_result_key"),
            "regulation_home_goals": int(row.get("regulation_home_goals") or 0),
            "regulation_away_goals": int(row.get("regulation_away_goals") or 0),
        }
        for row in espn_results
    ]

    missing_rows = []
    for match in matches:
        if match["match_id"] not in results_by_id:
            missing_rows.append({**match, "gap": "missing_result"})
        if match["match_id"] not in selected_by_match:
            missing_rows.append({**match, "gap": "missing_prediction_snapshot"})

    by_market = group_stats(settled_rows, "market_type")
    by_stage = group_stats(settled_rows, "stage")
    calibration = calibration_rows(settled_rows)
    thresholds = threshold_simulations(settled_rows)
    sensitivity = sensitivity_rows(settled_rows)
    live_summary = live_summary_rows(live_rows, results_by_id)
    factors = factor_signal_rows(settled_rows)

    write_csv(tables_dir / "modelled_matches_results.csv", modelled_result_rows)
    write_csv(tables_dir / "prematch_market_rows.csv", enriched_markets)
    write_csv(tables_dir / "market_type_performance.csv", by_market)
    write_csv(tables_dir / "stage_performance.csv", by_stage)
    write_csv(tables_dir / "calibration.csv", calibration)
    write_csv(tables_dir / "edge_threshold_simulation.csv", thresholds)
    write_csv(tables_dir / "favorite_haircut_sensitivity.csv", sensitivity)
    write_csv(tables_dir / "live_summary.csv", live_summary)
    write_csv(tables_dir / "factor_signals.csv", factors)
    write_csv(tables_dir / "missing_research_rows.csv", missing_rows)
    write_csv(tables_dir / "background_factor_dataset.csv", background_rows)
    write_csv(tables_dir / "background_factor_signals.csv", background_signals)
    write_csv(tables_dir / "live_factor_dataset.csv", live_feature_dataset)
    write_csv(tables_dir / "live_factor_signals.csv", live_signals)

    audit = {
        "matches": len(matches),
        "selected_snapshots": len(selected_snapshots),
        "joined_results": sum(1 for match in matches if match["match_id"] in results_by_id),
        "espn_results": len(espn_results),
        "market_rows": len(enriched_markets),
        "settled_market_rows": len(settled_rows),
        "live_snapshots": len(live_rows),
        "synced_live_snapshots": sum(1 for row in live_rows if row.get("data_quality") in ("synced", "post")),
        "inplay_recommendations": len(inplay_rows),
        "price_points": db_scalar(conn, "SELECT COUNT(*) FROM price_points"),
        "top_holder_rows": db_scalar(conn, "SELECT COUNT(*) FROM top_holder_snapshots"),
        "backfill": backfill,
    }

    write_reports(
        out_dir,
        audit,
        result_distribution(espn_public_rows),
        result_distribution(modelled_result_rows),
        by_market,
        by_stage,
        calibration,
        thresholds,
        sensitivity,
        live_summary,
        factors,
        missing_rows,
    )
    write_background_live_factor_reports(
        out_dir,
        background_rows,
        background_signals,
        live_feature_dataset,
        live_signals,
    )

    print(json.dumps({
        "ok": True,
        "db": str(db_path),
        "out": str(out_dir),
        "matches": audit["matches"],
        "joinedResults": audit["joined_results"],
        "settledMarketRows": audit["settled_market_rows"],
        "backgroundFactorRows": len(background_rows),
        "liveFactorRows": len(live_feature_dataset),
        "backfill": backfill,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    run()

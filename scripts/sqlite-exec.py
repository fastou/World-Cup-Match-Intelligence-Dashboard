#!/usr/bin/env python3
import json
import os
import sqlite3
import sys
import time


def row_to_dict(cursor, row):
    columns = [description[0] for description in cursor.description or []]
    return {column: row[index] for index, column in enumerate(columns)}


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: sqlite-exec.py <db-path>")

    payload = json.load(sys.stdin)
    operations = payload.get("operations") or []
    timeout_seconds = float(os.environ.get("SQLITE_BUSY_TIMEOUT_SECONDS", "3"))
    retry_count = int(os.environ.get("SQLITE_BUSY_RETRIES", "3"))
    for attempt in range(retry_count):
        conn = sqlite3.connect(sys.argv[1], timeout=timeout_seconds)
        try:
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute(f"PRAGMA busy_timeout={int(timeout_seconds * 1000)}")
            with conn:
                for operation in operations:
                    sql = operation.get("sql") or ""
                    if operation.get("script"):
                        conn.executescript(sql)
                    else:
                        cursor = conn.execute(sql, operation.get("params") or [])
                        if operation.get("fetch") == "one":
                            row = cursor.fetchone()
                            print(json.dumps(row_to_dict(cursor, row) if row else None, ensure_ascii=False))
                        elif operation.get("fetch") == "all":
                            print(json.dumps([row_to_dict(cursor, row) for row in cursor.fetchall()], ensure_ascii=False))
            return
        except sqlite3.OperationalError as error:
            if "locked" not in str(error).lower() and "busy" not in str(error).lower():
                raise
            if attempt == retry_count - 1:
                raise
            time.sleep(0.5 * (attempt + 1))
        finally:
            conn.close()


if __name__ == "__main__":
    main()

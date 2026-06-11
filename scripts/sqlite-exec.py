#!/usr/bin/env python3
import json
import sqlite3
import sys


def row_to_dict(cursor, row):
    columns = [description[0] for description in cursor.description or []]
    return {column: row[index] for index, column in enumerate(columns)}


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: sqlite-exec.py <db-path>")

    payload = json.load(sys.stdin)
    operations = payload.get("operations") or []
    conn = sqlite3.connect(sys.argv[1])
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
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
    finally:
        conn.close()


if __name__ == "__main__":
    main()

# Deploy World Cup Dashboard

Target URL:

```text
http://3.252.137.211/worldcup/
```

The app is ready to run under `/worldcup`:

```bash
BASE_PATH=/worldcup PORT=4174 node server.js
```

Server setup:

```bash
sudo mkdir -p /opt/worldcup-polymarket-dashboard
sudo chown -R "$USER":"$USER" /opt/worldcup-polymarket-dashboard
rsync -av --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude data/worldcup-context.json \
  --exclude data/worldcup-history.sqlite \
  --exclude data/worldcup-history.sqlite-shm \
  --exclude data/worldcup-history.sqlite-wal \
  ./ /opt/worldcup-polymarket-dashboard/

sudo cp /opt/worldcup-polymarket-dashboard/deploy/worldcup-dashboard.service /etc/systemd/system/worldcup-dashboard.service
sudo cp /opt/worldcup-polymarket-dashboard/deploy/worldcup-context-sync.service /etc/systemd/system/worldcup-context-sync.service
sudo cp /opt/worldcup-polymarket-dashboard/deploy/worldcup-context-sync.timer /etc/systemd/system/worldcup-context-sync.timer
sudo cp /opt/worldcup-polymarket-dashboard/deploy/worldcup-history-archive.service /etc/systemd/system/worldcup-history-archive.service
sudo cp /opt/worldcup-polymarket-dashboard/deploy/worldcup-history-archive.timer /etc/systemd/system/worldcup-history-archive.timer
sudo systemctl daemon-reload
sudo systemctl enable --now worldcup-dashboard
sudo systemctl enable --now worldcup-context-sync.timer
sudo systemctl enable --now worldcup-history-archive.timer
sudo systemctl status worldcup-dashboard --no-pager
```

Dynamic public context refresh:

```bash
cd /opt/worldcup-polymarket-dashboard
npm run sync:context
systemctl list-timers worldcup-context-sync.timer --no-pager
```

History archive:

```bash
cd /opt/worldcup-polymarket-dashboard
npm run archive:dashboard
systemctl list-timers worldcup-history-archive.timer --no-pager
python3 - <<'PY'
import sqlite3
conn = sqlite3.connect("data/worldcup-history.sqlite")
print([row[0] for row in conn.execute("select name from sqlite_master where type in ('table','view') order by name")])
conn.close()
PY
```

Record a final match result:

```bash
cd /opt/worldcup-polymarket-dashboard
npm run record:result -- --match 2026-06-12-mex-rsa --home-goals 2 --away-goals 1 --source manual
python3 - <<'PY'
import sqlite3
conn = sqlite3.connect("data/worldcup-history.sqlite")
for row in conn.execute("select captured_at, match_id, market_name, edge, settled_win, profit_per_share from v_moneyline_backtest limit 10"):
    print(row)
conn.close()
PY
```

Optional OpenAI synthesis:

```bash
sudo tee /etc/worldcup-dashboard.env >/dev/null <<'EOF'
OPENAI_API_KEY=replace-with-your-key
OPENAI_MODEL=gpt-4o-mini
EOF
sudo chmod 600 /etc/worldcup-dashboard.env
sudo systemctl restart worldcup-context-sync.service
```

Nginx:

1. Open the existing nginx site config.
2. Paste the contents of `deploy/nginx-worldcup.conf` inside the active `server { ... }` block.
3. Reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Health checks:

```bash
curl http://127.0.0.1:4174/worldcup/api/health
curl http://3.252.137.211/worldcup/api/health
curl 'http://3.252.137.211/worldcup/api/dashboard?force=1'
```

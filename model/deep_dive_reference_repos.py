import requests
import json
import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

files_to_fetch = [
    ("mois-khan/CallShield-AI", "main", "CallShield_Architecture_State.md"),
    ("sidcodes-07/ScamVoice-", "main", "README.md"),
    ("sidcodes-07/ScamVoice-", "main", "CLAUDE.md"),
    ("dungnotnull/deepfake-shield-agent", "main", "PROJECT-DETAIL.md"),
    ("dungnotnull/deepfake-shield-agent", "main", "README.md"),
    ("dungnotnull/deepfake-shield-agent", "main", "src/audio_detector/feature_extractor.py"),
    ("dungnotnull/deepfake-shield-agent", "main", "src/audio_detector/audio_ensemble.py"),
    ("dungnotnull/deepfake-shield-agent", "main", "src/alert_engine/risk_aggregator.py"),
]

headers = {"User-Agent": "Mozilla/5.0"}
os.makedirs("reference_repos", exist_ok=True)

for repo, branch, filepath in files_to_fetch:
    url = f"https://raw.githubusercontent.com/{repo}/{branch}/{filepath}"
    r = requests.get(url, headers=headers)
    safe_name = repo.split("/")[1] + "_" + os.path.basename(filepath)
    local_path = os.path.join("reference_repos", safe_name)
    if r.status_code == 200:
        with open(local_path, "w", encoding="utf-8") as f:
            f.write(r.text)
        print(f"Downloaded {repo}/{filepath} -> {local_path} ({len(r.text)} chars)")
    else:
        print(f"Failed {repo}/{filepath}: status {r.status_code}")

# Also check mois-khan/CallShield-AI backend/pipeline files
tree_url = "https://api.github.com/repos/mois-khan/CallShield-AI/git/trees/main?recursive=1"
tr = requests.get(tree_url, headers=headers)
if tr.status_code == 200:
    py_files = [item["path"] for item in tr.json().get("tree", []) if item["path"].endswith(".py") or item["path"].endswith(".dart")]
    print("\nCallShield-AI interesting files:", py_files[:20])

print("\nDeep dive fetch complete.")

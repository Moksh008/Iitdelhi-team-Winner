import requests
import json
import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

repos = [
    "mois-khan/CallShield-AI",
    "sidcodes-07/ScamVoice-",
    "dungnotnull/deepfake-shield-agent"
]

headers = {"User-Agent": "Mozilla/5.0"}

results = {}

for repo in repos:
    print(f"\n{'='*70}\nInspecting GitHub Repo: {repo}\n{'='*70}")
    url = f"https://api.github.com/repos/{repo}"
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        print(f"Error fetching repo metadata: {r.status_code}")
        continue
    
    meta = r.json()
    default_branch = meta.get("default_branch", "main")
    desc = meta.get("description", "")
    print(f"Description: {desc}")
    print(f"Default Branch: {default_branch}")
    print(f"Stars: {meta.get('stargazers_count', 0)}, Forks: {meta.get('forks_count', 0)}")

    # Fetch Tree
    tree_url = f"https://api.github.com/repos/{repo}/git/trees/{default_branch}?recursive=1"
    tr = requests.get(tree_url, headers=headers)
    files = []
    if tr.status_code == 200:
        files = [item["path"] for item in tr.json().get("tree", []) if item["type"] == "blob"]
        print(f"Total files: {len(files)}")
        print("Sample files:", files[:25])
    
    # Fetch README
    readme_url = f"https://raw.githubusercontent.com/{repo}/{default_branch}/README.md"
    rm = requests.get(readme_url, headers=headers)
    readme_text = rm.text if rm.status_code == 200 else ""
    print(f"README length: {len(readme_text)} chars")
    
    results[repo] = {
        "description": desc,
        "files": files,
        "readme_snippet": readme_text[:1200]
    }

with open("reference_repos_analysis.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print("\nAnalysis saved to reference_repos_analysis.json")

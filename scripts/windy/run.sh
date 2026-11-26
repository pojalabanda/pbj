#!/bin/zsh
# Zaganja ga launchd (glej si.pojalabanda.pbj-windy.plist). Ročno: ./run.sh
# AUTO_DEPLOY=1 ./run.sh  -> po novem posnetku še git commit + build + deploy
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")" || exit 1
mkdir -p logs
{
  node capture.mjs
  rc=$?
  if [[ "$AUTO_DEPLOY" == "1" ]]; then
    cd ../..
    YEAR=$(node -p "require('./scripts/windy/routes.json').year")
    if [[ -n "$(git status --porcelain public/assets/$YEAR)" ]]; then
      git add public/assets/$YEAR && git commit -m "$YEAR: vreme update" && npm run build && npm run deploy
    fi
  fi
  exit $rc
} >> logs/capture.log 2>&1

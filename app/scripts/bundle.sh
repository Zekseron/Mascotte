#!/bin/bash
# Compila Mascotte in release e crea build.noindex/Mascotte.app (firma ad hoc).
# Si può lanciare da qualunque cartella:  ROOT/app/scripts/bundle.sh
#
# Dentro l'app finiscono: l'eseguibile, characters/ (i personaggi del progetto)
# e states.json (spec/states.json) nelle risorse.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"   # ROOT/app
ROOT="$(cd "$APP_DIR/.." && pwd)"         # radice del progetto
VERSION="0.5"
BUNDLE_ID="local.mascotte.app"
APP="$APP_DIR/build.noindex/Mascotte.app"

[ -f "$APP_DIR/Package.swift" ] || { echo "Package.swift non trovato in $APP_DIR" >&2; exit 1; }
[ -d "$ROOT/characters" ]       || { echo "Cartella characters non trovata in $ROOT" >&2; exit 1; }
[ -f "$ROOT/spec/states.json" ] || { echo "spec/states.json non trovato in $ROOT" >&2; exit 1; }

echo "==> Compilo in release"
swift build -c release --package-path "$APP_DIR"
BIN="$(swift build -c release --package-path "$APP_DIR" --show-bin-path)/Mascotte"
[ -x "$BIN" ] || { echo "Eseguibile non trovato: $BIN" >&2; exit 1; }

echo "==> Creo $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Mascotte"
cp -R "$ROOT/characters" "$APP/Contents/Resources/characters"
cp "$ROOT/spec/states.json" "$APP/Contents/Resources/states.json"
find "$APP" -name '.DS_Store' -delete
printf 'APPL????' > "$APP/Contents/PkgInfo"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>it</string>
    <key>CFBundleExecutable</key>
    <string>Mascotte</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Mascotte</string>
    <key>CFBundleDisplayName</key>
    <string>Mascotte</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

plutil -lint "$APP/Contents/Info.plist"

echo "==> Firmo (ad hoc)"
codesign --force --deep -s - "$APP"
codesign --verify --verbose "$APP"

echo "==> Fatto: $APP"
echo "    Avvio:     open \"$APP\""
echo "    Controllo: \"$APP/Contents/MacOS/Mascotte\" --self-test"

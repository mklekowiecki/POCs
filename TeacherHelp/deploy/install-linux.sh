#!/usr/bin/env bash
# Instaluje (lub aktualizuje) aplikację „Lekcja Informatyki” (Teacher Help) na Linuksie:
#   1. publikuje aplikację z kodu (wymaga .NET 10 SDK) albo bierze gotowy folder --publish-path,
#      zawsze jako self-contained – na serwerze nie trzeba instalować .NET,
#   2. tworzy użytkownika systemowego i usługę systemd (start z systemem, restart po awarii),
#   3. stawia nginx jako reverse proxy (WebSockets dla SignalR, wysyłka plików do 200 MB),
#   4. opcjonalnie: HTTPS z Let's Encrypt (--domain), gdy serwer ma być dostępny z internetu,
#   5. otwiera port w zaporze ufw, jeśli jest włączona.
#
# Uruchomienie ponownie aktualizuje aplikację: pliki są podmieniane, hasło zostaje (chyba że podasz nowe).
# Stan lekcji jest tylko w pamięci – aktualizacja albo restart usługi kasuje bieżącą sesję.
#
# Przykłady (jako root, z katalogu repozytorium albo skopiowanego folderu deploy/):
#   sudo ./install-linux.sh                                  # sieć lokalna, port 80, o hasło zapyta
#   sudo ./install-linux.sh --password tajne --port 8080
#   sudo ./install-linux.sh --domain lekcja.szkola.pl        # internet: HTTPS przez certbot
#   sudo ./install-linux.sh --publish-path ./paczka          # gotowy „dotnet publish -r linux-x64 --self-contained”
#   sudo ./install-linux.sh --no-nginx                       # bez nginx: aplikacja sama słucha na porcie
#   sudo ./install-linux.sh --uninstall [--remove-files]
set -euo pipefail

NAME="teacherhelp"
INSTALL_DIR="/opt/teacherhelp"
SERVICE_FILE="/etc/systemd/system/${NAME}.service"
APP_PORT=5000          # port aplikacji za nginx (tylko localhost)
PORT=80                # port dla uczniów (nginx albo sama aplikacja przy --no-nginx)
DOMAIN=""
PASSWORD=""
PUBLISH_PATH=""
USE_NGINX=1
UNINSTALL=0
REMOVE_FILES=0

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
die() { echo "BŁĄD: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --app-port) APP_PORT="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --publish-path) PUBLISH_PATH="$(realpath "$2")"; shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --no-nginx) USE_NGINX=0; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --remove-files) REMOVE_FILES=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "Nieznana opcja: $1" >&2; usage 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || die "uruchom jako root (sudo $0 ...)."
[[ "$PORT" =~ ^[0-9]+$ && "$PORT" -ge 1 && "$PORT" -le 65535 ]] || die "nieprawidłowy port: $PORT"
[[ "$APP_PORT" =~ ^[0-9]+$ && "$APP_PORT" -ne "$PORT" ]] || die "nieprawidłowy --app-port: $APP_PORT"
[[ -z "$DOMAIN" || $USE_NGINX -eq 1 ]] || die "--domain wymaga nginx (bez --no-nginx)."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_LINK=/etc/nginx/sites-enabled/${NAME}
# Debian/Ubuntu: sites-available + sites-enabled; inne dystrybucje: conf.d. Ustalane po instalacji nginx.
nginx_site() { if [[ -d /etc/nginx/sites-available ]]; then echo /etc/nginx/sites-available/${NAME}; else echo /etc/nginx/conf.d/${NAME}.conf; fi; }

# ---------------------------------------------------------------- odinstalowanie
if [[ $UNINSTALL -eq 1 ]]; then
  step "Usuwanie usługi i konfiguracji nginx"
  systemctl disable --now "$NAME" 2>/dev/null || true
  rm -f "$SERVICE_FILE" "$NGINX_LINK" /etc/nginx/sites-available/${NAME} /etc/nginx/conf.d/${NAME}.conf
  systemctl daemon-reload
  if command -v nginx >/dev/null && nginx -t 2>/dev/null; then systemctl reload nginx || true; fi
  if [[ $REMOVE_FILES -eq 1 ]]; then
    rm -rf "$INSTALL_DIR" "/var/lib/${NAME}"
    userdel "$NAME" 2>/dev/null || true
  fi
  echo "Gotowe."
  exit 0
fi

# ---------------------------------------------------------------- pakiety systemowe
install_packages() {
  if command -v apt-get >/dev/null; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
  elif command -v dnf >/dev/null; then
    dnf install -y "$@"
  else
    die "nie umiem zainstalować pakietów ($*) na tej dystrybucji – zainstaluj je ręcznie i uruchom skrypt ponownie."
  fi
}

step "Sprawdzanie wymagań"
command -v apt-get >/dev/null && apt-get update -qq
# .NET potrzebuje ICU (polskie znaki, porównywanie bez wielkości liter).
if ! ldconfig -p | grep -c libicuuc >/dev/null; then
  if command -v apt-get >/dev/null; then
    install_packages "$(apt-cache pkgnames libicu | grep -E '^libicu[0-9]+$' | sort -V | tail -1)"
  else
    install_packages libicu
  fi
fi
if [[ $USE_NGINX -eq 1 ]] && ! command -v nginx >/dev/null; then install_packages nginx; fi
if [[ -n "$DOMAIN" ]] && ! command -v certbot >/dev/null; then
  install_packages certbot python3-certbot-nginx
fi

# ---------------------------------------------------------------- publikacja
case "$(uname -m)" in
  x86_64) RID=linux-x64 ;;
  aarch64|arm64) RID=linux-arm64 ;;   # np. Raspberry Pi 4/5 z 64-bitowym systemem
  armv7l) RID=linux-arm ;;
  *) die "nieobsługiwana architektura: $(uname -m)" ;;
esac

if [[ -z "$PUBLISH_PATH" ]]; then
  PROJECT="$SCRIPT_DIR/../TeacherHelp/TeacherHelp.csproj"
  [[ -f "$PROJECT" ]] || die "nie ma kodu aplikacji ($PROJECT) – podaj --publish-path z gotową paczką."
  command -v dotnet >/dev/null || die "brak .NET SDK. Zainstaluj go albo opublikuj na innym komputerze:
  dotnet publish TeacherHelp/TeacherHelp.csproj -c Release -r $RID --self-contained -o paczka
i uruchom ten skrypt z --publish-path paczka."
  step "Publikowanie aplikacji ($RID)"
  PUBLISH_PATH="$(mktemp -d)"
  trap 'rm -rf "$PUBLISH_PATH"' EXIT
  dotnet publish "$PROJECT" -c Release -r "$RID" --self-contained -o "$PUBLISH_PATH" --nologo -v quiet
fi
[[ -x "$PUBLISH_PATH/TeacherHelp" ]] || die "w $PUBLISH_PATH nie ma pliku wykonywalnego TeacherHelp (paczka musi być dla $RID)."

# ---------------------------------------------------------------- pliki i użytkownik
step "Kopiowanie plików do $INSTALL_DIR"
id "$NAME" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$NAME"
systemctl stop "$NAME" 2>/dev/null || true
mkdir -p "$INSTALL_DIR"
# Wszystko poza appsettings.Production.json (hasło) jest podmieniane.
find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name appsettings.Production.json -exec rm -rf {} +
cp -a "$PUBLISH_PATH/." "$INSTALL_DIR/"
rm -f "$INSTALL_DIR/web.config"   # tylko dla IIS
chmod +x "$INSTALL_DIR/TeacherHelp"

# ---------------------------------------------------------------- konfiguracja
SETTINGS="$INSTALL_DIR/appsettings.Production.json"
if [[ -z "$PASSWORD" && -f "$SETTINGS" ]]; then
  PASSWORD="$(sed -n 's/.*"TeacherPassword": *"\(\([^"\\]\|\\.\)*\)".*/\1/p' "$SETTINGS" | head -1)"
  PASSWORD_ESCAPED=1
fi
if [[ -z "$PASSWORD" ]]; then
  read -r -s -p "Hasło nauczyciela: " PASSWORD; echo
  [[ -n "$PASSWORD" ]] || die "hasło nauczyciela nie może być puste."
fi
json_escape() { local s="${1//\\/\\\\}"; s="${s//\"/\\\"}"; printf '%s' "$s"; }
[[ "${PASSWORD_ESCAPED:-0}" -eq 1 ]] || PASSWORD="$(json_escape "$PASSWORD")"

if [[ $USE_NGINX -eq 1 ]]; then URLS="http://127.0.0.1:${APP_PORT}"; else URLS="http://0.0.0.0:${PORT}"; fi
PUBLIC_URL=""
if [[ -n "$DOMAIN" ]]; then PUBLIC_URL="https://${DOMAIN}"; fi

cat > "$SETTINGS" <<EOF
{
  "Urls": "${URLS}",
  "TeacherHelp": {
    "TeacherPassword": "${PASSWORD}",
    "PublicUrl": "${PUBLIC_URL}"
  }
}
EOF
chown -R root:"$NAME" "$INSTALL_DIR"
chmod 640 "$SETTINGS"

# ---------------------------------------------------------------- systemd
step "Usługa systemd ($SERVICE_FILE)"
CAPS=""
if [[ $USE_NGINX -eq 0 && $PORT -lt 1024 ]]; then
  CAPS="AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE"
fi
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Lekcja Informatyki (Teacher Help)
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
User=${NAME}
Group=${NAME}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/TeacherHelp
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=DOTNET_NOLOGO=1
# Klucze ciasteczka logowania (ASP.NET Data Protection) w /var/lib/teacherhelp/.aspnet – nauczyciel
# pozostaje zalogowany po restarcie usługi, a w logach nie ma ostrzeżeń o kluczach tylko w pamięci.
StateDirectory=${NAME}
Environment=HOME=/var/lib/${NAME}
Restart=always
RestartSec=3
KillSignal=SIGINT
TimeoutStopSec=15
${CAPS}
# Pliki udostępniane uczniom lądują w prywatnym /tmp usługi.
PrivateTmp=true
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectControlGroups=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now "$NAME"

# ---------------------------------------------------------------- nginx
if [[ $USE_NGINX -eq 1 ]]; then
  NGINX_SITE="$(nginx_site)"
  step "nginx ($NGINX_SITE)"
  SERVER_NAME="${DOMAIN:-_}"
  cat > "$NGINX_SITE" <<EOF
# Teacher Help – wygenerowane przez install-linux.sh
map \$http_upgrade \$teacherhelp_connection {
    default upgrade;
    ''      close;
}

server {
    listen ${PORT};
    listen [::]:${PORT};
    server_name ${SERVER_NAME};

    # Tyle samo co limit wysyłki plików w aplikacji.
    client_max_body_size 200m;

    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        # SignalR (WebSockets)
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection \$teacherhelp_connection;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
        proxy_request_buffering off;
    }
}
EOF
  if [[ -d /etc/nginx/sites-enabled ]]; then
    ln -sf "$NGINX_SITE" "$NGINX_LINK"
    # Domyślna strona nginx zajmuje port 80 jako default_server – przy instalacji w sieci lokalnej przeszkadza.
    if [[ -z "$DOMAIN" && "$PORT" == 80 ]]; then rm -f /etc/nginx/sites-enabled/default; fi
  fi
  nginx -t
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl reload nginx 2>/dev/null || systemctl restart nginx

  if [[ -n "$DOMAIN" ]]; then
    step "Certyfikat HTTPS dla $DOMAIN (Let's Encrypt)"
    echo "Domena musi już wskazywać na ten serwer, a port 80 i 443 muszą być otwarte z internetu."
    certbot --nginx -d "$DOMAIN" --redirect
  fi
fi

# ---------------------------------------------------------------- zapora
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  step "Zapora ufw"
  ufw allow "${PORT}/tcp"
  if [[ -n "$DOMAIN" ]]; then ufw allow 443/tcp; fi
fi

# ---------------------------------------------------------------- podsumowanie
sleep 2
systemctl is-active --quiet "$NAME" || { journalctl -u "$NAME" -n 30 --no-pager; die "usługa nie wystartowała (logi powyżej)."; }
if [[ -n "$DOMAIN" ]]; then
  BASE="https://${DOMAIN}"
else
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  BASE="http://${IP:-<adres-serwera>}$([[ "$PORT" == 80 ]] || echo ":$PORT")"
fi
echo
echo "Gotowe. Panel nauczyciela: ${BASE}/nauczyciel"
echo "Logi:    journalctl -u ${NAME} -f"
echo "Restart: systemctl restart ${NAME}   (kasuje bieżącą lekcję)"

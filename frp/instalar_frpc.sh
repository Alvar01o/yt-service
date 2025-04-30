#!/bin/bash
set -e

# Configuraciones básicas
FRP_VERSION="0.58.0"
INSTALL_DIR="$HOME/frp"
CONFIG_DIR="$HOME/.config/frp"

# Descargar frp
curl -LO https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_amd64.tar.gz
tar -xzf frp_${FRP_VERSION}_linux_amd64.tar.gz

# Crear carpetas
mkdir -p $INSTALL_DIR
mkdir -p $CONFIG_DIR

# Copiar binarios
cp frp_${FRP_VERSION}_linux_amd64/frpc $INSTALL_DIR/
#cp frp_${FRP_VERSION}_linux_amd64/frpc.ini $CONFIG_DIR/

# Crear archivo de configuración básico
cat <<EOF > $CONFIG_DIR/frpc.ini
[common]
server_addr = 208.167.249.208
server_port = 7000

[tunel_tcp_3000]
type = tcp
local_ip = 127.0.0.1
local_port = 3000
remote_port = 8080
EOF

echo "✅ frpc instalado. Ejecuta:"
echo "$INSTALL_DIR/frpc -c $CONFIG_DIR/frpc.ini"

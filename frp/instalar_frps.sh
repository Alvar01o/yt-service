#!/bin/bash
set -e

# Configuraciones básicas
FRP_VERSION="0.58.0"  # Puedes cambiar a la última versión si quieres
INSTALL_DIR="/opt/frp"
CONFIG_DIR="/etc/frp"

# Descargar frp
curl -LO https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_amd64.tar.gz
tar -xzf frp_${FRP_VERSION}_linux_amd64.tar.gz

# Crear carpetas
sudo mkdir -p $INSTALL_DIR
sudo mkdir -p $CONFIG_DIR

# Copiar archivos necesarios
sudo cp frp_${FRP_VERSION}_linux_amd64/frps $INSTALL_DIR/
#sudo cp frp_${FRP_VERSION}_linux_amd64/frps.ini $CONFIG_DIR/

# Crear archivo de configuración básico
cat <<EOF | sudo tee $CONFIG_DIR/frps.ini
[common]
bind_port = 7000           # puerto de control
bind_addr = "::"           # escucha en IPv6 y IPv4
dashboard_port = 7500
dashboard_user = admin
dashboard_pwd = admin
allow_ports = 8000-9000     # Puertos que vas a poder abrir
EOF

# Crear servicio systemd
cat <<EOF | sudo tee /etc/systemd/system/frps.service
[Unit]
Description=FRP Server
After=network.target

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/frps -c ${CONFIG_DIR}/frps.ini
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Recargar systemd y arrancar el servicio
sudo systemctl daemon-reload
sudo systemctl enable frps
sudo systemctl start frps
echo "✅ frps instalado y corriendo en el VPS."
sudo ufw allow 8080/tcp

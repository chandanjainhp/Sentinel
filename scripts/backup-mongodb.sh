#!/bin/bash
# Sentinel MongoDB Backup Script
# Usage: ./backup-mongodb.sh [backup_dir] [retention_days]
#
# Environment variables:
#   MONGODB_USER - MongoDB username (default: sentinel)
#   MONGODB_PASSWORD - MongoDB password (required in production)
#   MONGODB_AUTH_DB - Authentication database (default: admin)
#   MONGODB_DATABASE - Database to backup (default: sentinel)
#   MONGODB_HOST - MongoDB host (default: localhost)
#   MONGODB_PORT - MongoDB port (default: 27017)

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-/var/backups/mongodb}"
RETENTION_DAYS="${2:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
MONGODB_USER="${MONGODB_USER:-sentinel}"
MONGODB_PASSWORD="${MONGODB_PASSWORD:-}"
MONGODB_AUTH_DB="${MONGODB_AUTH_DB:-admin}"
MONGODB_DATABASE="${MONGODB_DATABASE:-sentinel}"
MONGODB_HOST="${MONGODB_HOST:-localhost}"
MONGODB_PORT="${MONGODB_PORT:-27017}"

# MongoDB connection URI
MONGO_URI="mongodb://${MONGODB_USER}:${MONGODB_PASSWORD}@${MONGODB_HOST}:${MONGODB_PORT}/${MONGODB_DATABASE}?authSource=${MONGODB_AUTH_DB}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup directory for this run
BACKUP_FILE="$BACKUP_DIR/sentinel_backup_$DATE"

# Check if we're running in Docker Compose
check_docker_compose() {
  if command -v docker &> /dev/null && docker compose ps &> /dev/null; then
    return 0
  fi
  return 1
}

# Check if we're running in standalone Docker
check_docker_standalone() {
  if command -v docker &> /dev/null && docker ps &> /dev/null; then
    return 0
  fi
  return 1
}

# Escape password for command line
escape_for_cmd() {
  echo "$1" | sed 's/\\/\\\\/g; s/\$/\\$/g; s/`/\\`/g; s/"/\\"/g; s/\ / /g'
}

PASSWORD_ESCAPED=$(escape_for_cmd "$MONGODB_PASSWORD")

echo "[$(date)] ========================================"
echo "[$(date)] Starting MongoDB backup"
echo "[$(date)] Database: $MONGODB_DATABASE"
echo "[$(date)] Backup directory: $BACKUP_DIR"
echo "[$(date)] ========================================"

# Perform backup
if check_docker_compose; then
  echo "[$(date)] Using Docker Compose"
  
  # Use docker compose exec to run mongodump inside the container
  if [ -z "$MONGODB_PASSWORD" ]; then
    docker compose exec -T mongodb mongodump \
      --db "$MONGODB_DATABASE" \
      --out "/tmp/backup_$DATE" \
      --gzip 2>&1
  else
    docker compose exec -T mongodb mongodump \
      --db "$MONGODB_DATABASE" \
      --username "$MONGODB_USER" \
      --password "$MONGODB_PASSWORD" \
      --authenticationDatabase "$MONGODB_AUTH_DB" \
      --out "/tmp/backup_$DATE" \
      --gzip 2>&1
  fi
  
  # Copy from container to host
  docker cp "sentinel-mongodb-1:/tmp/backup_$DATE" "$BACKUP_FILE"
  docker compose exec -T mongodb rm -rf "/tmp/backup_$DATE"
  
elif check_docker_standalone; then
  echo "[$(date)] Using standalone Docker"
  
  # Find the mongodb container
  CONTAINER=$(docker ps --filter "ancestor=mongo:7.0" --format "{{.Names}}" | head -n 1)
  
  if [ -z "$CONTAINER" ]; then
    echo "[$(date)] ERROR: Could not find MongoDB container"
    exit 1
  fi
  
  if [ -z "$MONGODB_PASSWORD" ]; then
    docker exec "$CONTAINER" mongodump \
      --db "$MONGODB_DATABASE" \
      --out "/tmp/backup_$DATE" \
      --gzip 2>&1
  else
    docker exec "$CONTAINER" mongodump \
      --db "$MONGODB_DATABASE" \
      --username "$MONGODB_USER" \
      --password "$MONGODB_PASSWORD" \
      --authenticationDatabase "$MONGODB_AUTH_DB" \
      --out "/tmp/backup_$DATE" \
      --gzip 2>&1
  fi
  
  # Copy from container to host
  docker cp "$CONTAINER:/tmp/backup_$DATE" "$BACKUP_FILE"
  docker exec "$CONTAINER" rm -rf "/tmp/backup_$DATE"
  
else
  echo "[$(date)] Using direct mongodump"
  
  # Use direct mongodump command
  if [ -z "$MONGODB_PASSWORD" ]; then
    mongodump \
      --db "$MONGODB_DATABASE" \
      --out "$BACKUP_FILE" \
      --gzip 2>&1
  else
    mongodump \
      --uri "$MONGO_URI" \
      --out "$BACKUP_FILE" \
      --gzip 2>&1
  fi
fi

# Verify backup was created
if [ -d "$BACKUP_FILE/$MONGODB_DATABASE" ]; then
  echo "[$(date)] Backup completed successfully"
  
  # Create a manifest file with metadata
  cat > "$BACKUP_FILE/backup_manifest.json" <<EOF
{
  "backup_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "database": "$MONGODB_DATABASE",
  "type": "full",
  "mongodump_version": "$(mongodump --version 2>/dev/null | head -n1 | awk '{print $2}' | tr -d '\n' || echo 'unknown')",
  "backup_size_bytes": $(du -sb "$BACKUP_FILE" | awk '{print $1}'),
  "host": "$(hostname)"
}
EOF
  
  echo "[$(date)] Backup manifest created"
  
  # Calculate actual backup size
  BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | awk '{print $1}')
  echo "[$(date)] Backup size: $BACKUP_SIZE"
  echo "[$(date)] Backup location: $BACKUP_FILE"
  
  # List collections backed up
  echo "[$(date)] Collections backed up:"
  ls -la "$BACKUP_FILE/$MONGODB_DATABASE/" | grep -E '\.bson$' | sed 's/\.bson$//' | sed 's/^.*_//' || \
  find "$BACKUP_FILE/$MONGODB_DATABASE" -name "*.bson" -exec basename {} \; | sed 's/\.bson$//' || \
  echo "  (could not list collections)"
  
else
  echo "[$(date)] ERROR: Backup failed - no output directory created"
  echo "[$(date)] Check if MongoDB is running and accessible"
  exit 1
fi

# Clean up old backups (retention)
if [ "$RETENTION_DAYS" -gt 0 ]; then
  echo "[$(date)] Cleaning up backups older than $RETENTION_DAYS days"
  find "$BACKUP_DIR" -maxdepth 1 -name "sentinel_backup_*" -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true
  
  # Count remaining backups
  BACKUP_COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name "sentinel_backup_*" -type d | wc -l)
  echo "[$(date)] $BACKUP_COUNT backups retained"
fi

echo "[$(date)] ========================================"
echo "[$(date)] Backup process completed"
echo "[$(date)] ========================================"

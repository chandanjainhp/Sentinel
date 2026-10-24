#!/bin/bash
# Sentinel MongoDB Restore Script
# Usage: ./restore-mongodb.sh <backup_dir> [database_name]
#
# WARNING: This script will OVERWRITE existing data in the target database!
#
# Environment variables:
#   MONGODB_USER - MongoDB username (default: sentinel)
#   MONGODB_PASSWORD - MongoDB password (required in production)
#   MONGODB_AUTH_DB - Authentication database (default: admin)
#   MONGODB_HOST - MongoDB host (default: localhost)
#   MONGODB_PORT - MongoDB port (default: 27017)
#   FORCE_RESTORE - Set to "true" to skip confirmation prompt (use with caution!)

set -euo pipefail

# Validate arguments
if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup_dir> [database_name]"
  echo "Example: $0 /var/backups/mongodb/sentinel_backup_20261022_120000"
  exit 1
fi

# Configuration
BACKUP_DIR="$(realpath "${1}")"
DATABASE_NAME="${2:-sentinel}"
MONGODB_USER="${MONGODB_USER:-sentinel}"
MONGODB_PASSWORD="${MONGODB_PASSWORD:-}"
MONGODB_AUTH_DB="${MONGODB_AUTH_DB:-admin}"
MONGODB_HOST="${MONGODB_HOST:-localhost}"
MONGODB_PORT="${MONGODB_PORT:-27017}"
FORCE_RESTORE="${FORCE_RESTORE:-false}"

# MongoDB connection URI
MONGO_URI="mongodb://${MONGODB_USER}:${MONGODB_PASSWORD}@${MONGODB_HOST}:${MONGODB_PORT}/${DATABASE_NAME}?authSource=${MONGODB_AUTH_DB}"

# Extract database name from backup path if not specified
# BACKUP_DIR might be /path/to/sentinel_backup_20261022_120000
# The actual database is in a subdirectory
if [ ! -d "$BACKUP_DIR/$DATABASE_NAME" ]; then
  # Try to find the database directory in the backup
  DB_DIR=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "sentinel" | head -n 1)
  if [ -n "$DB_DIR" ]; then
    DATABASE_NAME=$(basename "$DB_DIR")
    echo "[$(date)] Auto-detected database name: $DATABASE_NAME"
  fi
fi

# Validate backup directory
echo "[$(date)] ========================================"
echo "[$(date)] Starting MongoDB restore"
echo "[$(date)] Backup directory: $BACKUP_DIR"
echo "[$(date)] Target database: $DATABASE_NAME"
echo "[$(date)] ========================================"

if [ ! -d "$BACKUP_DIR/$DATABASE_NAME" ]; then
  echo "[$(date)] ERROR: Backup directory does not contain database '$DATABASE_NAME'"
  echo "[$(date)] Contents of $BACKUP_DIR:"
  ls -la "$BACKUP_DIR" || true
  echo "[$(date)] Available subdirectories:"
  find "$BACKUP_DIR" -maxdepth 1 -type d | sed 's|^|  |' || true
  exit 1
fi

# Read manifest if available
if [ -f "$BACKUP_DIR/backup_manifest.json" ]; then
  echo "[$(date)] Backup manifest:"
  cat "$BACKUP_DIR/backup_manifest.json" | python3 -m json.tool 2>/dev/null || cat "$BACKUP_DIR/backup_manifest.json"
fi

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

# Check if MongoDB is accessible
check_mongodb_accessible() {
  if check_docker_compose; then
    docker compose exec -T mongodb mongosh --quiet --eval "db.adminCommand({ping: 1}).ok" 2>/dev/null && return 0
  elif check_docker_standalone; then
    CONTAINER=$(docker ps --filter "ancestor=mongo:7.0" --format "{{.Names}}" | head -n 1)
    [ -n "$CONTAINER" ] && docker exec "$CONTAINER" mongosh --quiet --eval "db.adminCommand({ping: 1}).ok" 2>/dev/null && return 0
  else
    mongosh --quiet --eval "db.adminCommand({ping: 1}).ok" 2>/dev/null && return 0
  fi
  return 1
}

# Safety check - ask for confirmation unless FORCE_RESTORE=true
if [ "$FORCE_RESTORE" != "true" ]; then
  echo ""
  echo "[$(date)] ========================================"
  echo "[$(date)] WARNING: This will OVERWRITE all data in database '$DATABASE_NAME'"
  echo "[$(date)] This cannot be undone!"
  echo "[$(date)] ========================================"
  echo ""
  echo "[$(date)] Restore will drop the existing '$DATABASE_NAME' database and"
  echo "[$(date)] replace it with data from: $BACKUP_DIR"
  echo ""
  echo "[$(date)] Press Ctrl+C to abort within 10 seconds..."
  sleep 10
  echo ""
fi

# Check MongoDB is accessible
if ! check_mongodb_accessible; then
  echo "[$(date)] ERROR: Cannot connect to MongoDB. Is it running?"
  exit 1
fi

echo "[$(date)] Starting MongoDB restore from $BACKUP_DIR"
echo "[$(date)] Target database: $DATABASE_NAME"

# Perform restore
if check_docker_compose; then
  echo "[$(date)] Using Docker Compose"
  
  if [ -z "$MONGODB_PASSWORD" ]; then
    docker compose exec -T mongodb mongorestore \
      --db "$DATABASE_NAME" \
      --drop \
      "$BACKUP_DIR/$DATABASE_NAME" \
      --gzip 2>&1
  else
    docker compose exec -T mongodb mongorestore \
      --db "$DATABASE_NAME" \
      --username "$MONGODB_USER" \
      --password "$MONGODB_PASSWORD" \
      --authenticationDatabase "$MONGODB_AUTH_DB" \
      --drop \
      "$BACKUP_DIR/$DATABASE_NAME" \
      --gzip 2>&1
  fi
  
elif check_docker_standalone; then
  echo "[$(date)] Using standalone Docker"
  
  # Find the mongodb container
  CONTAINER=$(docker ps --filter "ancestor=mongo:7.0" --format "{{.Names}}" | head -n 1)
  
  if [ -z "$CONTAINER" ]; then
    echo "[$(date)] ERROR: Could not find MongoDB container"
    exit 1
  fi
  
  # Copy backup to container
  docker cp "$BACKUP_DIR" "$CONTAINER:/tmp/restore_input"
  
  if [ -z "$MONGODB_PASSWORD" ]; then
    docker exec "$CONTAINER" mongorestore \
      --db "$DATABASE_NAME" \
      --drop \
      "/tmp/restore_input/$DATABASE_NAME" \
      --gzip 2>&1
  else
    docker exec "$CONTAINER" mongorestore \
      --db "$DATABASE_NAME" \
      --username "$MONGODB_USER" \
      --password "$MONGODB_PASSWORD" \
      --authenticationDatabase "$MONGODB_AUTH_DB" \
      --drop \
      "/tmp/restore_input/$DATABASE_NAME" \
      --gzip 2>&1
  fi
  
  # Clean up
  docker exec "$CONTAINER" rm -rf "/tmp/restore_input"
  
else
  echo "[$(date)] Using direct mongorestore"
  
  if [ -z "$MONGODB_PASSWORD" ]; then
    mongorestore \
      --db "$DATABASE_NAME" \
      --drop \
      "$BACKUP_DIR/$DATABASE_NAME" \
      --gzip 2>&1
  else
    mongorestore \
      --uri "$MONGO_URI" \
      --drop \
      "$BACKUP_DIR/$DATABASE_NAME" \
      --gzip 2>&1
  fi
fi

# Verify restore was successful
if check_docker_compose; then
  COLLECTION_COUNT=$(docker compose exec -T mongodb mongosh "$DATABASE_NAME" --quiet --eval "db.getCollectionNames().length" 2>/dev/null || echo "0")
  DOCUMENT_COUNT=$(docker compose exec -T mongodb mongosh "$DATABASE_NAME" --quiet --eval "db.getCollectionNames().map(c => db.getCollection(c).countDocuments()).reduce((a, b) => a + b, 0)" 2>/dev/null || echo "0")
elif check_docker_standalone; then
  CONTAINER=$(docker ps --filter "ancestor=mongo:7.0" --format "{{.Names}}" | head -n 1)
  COLLECTION_COUNT=$(docker exec "$CONTAINER" mongosh "$DATABASE_NAME" --quiet --eval "db.getCollectionNames().length" 2>/dev/null || echo "0")
  DOCUMENT_COUNT=$(docker exec "$CONTAINER" mongosh "$DATABASE_NAME" --quiet --eval "db.getCollectionNames().map(c => db.getCollection(c).countDocuments()).reduce((a, b) => a + b, 0)" 2>/dev/null || echo "0")
else
  COLLECTION_COUNT=$(mongosh "$DATABASE_NAME" --quiet --eval "db.getCollectionNames().length" 2>/dev/null || echo "0")
  DOCUMENT_COUNT=$(mongosh "$DATABASE_NAME" --quiet --eval "db.getCollectionNames().map(c => db.getCollection(c).countDocuments()).reduce((a, b) => a + b, 0)" 2>/dev/null || echo "0")
fi

echo "[$(date)] ========================================"
echo "[$(date)] Restore completed"
echo "[$(date)] Collections: $COLLECTION_COUNT"
echo "[$(date)] Documents: $DOCUMENT_COUNT"
echo "[$(date)] ========================================"

# Sentinel MongoDB Backup and Restore Procedures

## Overview

This document describes the backup and restore procedures for the Sentinel MongoDB database. These procedures are critical for production deployments to prevent data loss and ensure business continuity.

**Status:** Backup tooling implemented, restore procedures documented. No actual backup has been performed or verified at this time.

## Backup Strategy

### 1. Backup Frequency

- **Daily:** Full backup of all databases at 02:00 UTC
- **Hourly:** Incremental backup for production deployments with high write volume
- **On-demand:** Manual backup before major deployments or configuration changes

### 2. Backup Retention

| Backup Type | Retention Period | Storage Location |
|-------------|-----------------|-----------------|
| Daily | 30 days | Primary storage |
| Weekly | 12 weeks | Primary + Secondary storage |
| Monthly | 12 months | Cold storage |
| Yearly | 7 years | Archive storage |

### 3. What Gets Backed Up

- All MongoDB databases (default: `sentinel`)
- All collections (users, incidents, investigations, events, predictions, machines, sensors, sites)
- Index definitions
- Users and roles (if applicable)

### 4. Backup Storage

- **Primary:** Local Docker volume (`mongodb_data`)
- **Secondary:** External storage (S3, NFS, or other configured destination)
- **Encryption:** All backups encrypted at rest (optional, recommended for production)

---

## Backup Implementation

### Docker-Based Backup Script

The backup is performed using `mongodump` within the MongoDB container. This ensures:
- Consistent backups regardless of host configuration
- No dependency on host tools
- Ability to backup from any Docker environment

#### Location

Backup scripts are located in: `scripts/backup-mongodb.sh`

#### Script: `scripts/backup-mongodb.sh`

```bash
#!/bin/bash
# Sentinel MongoDB Backup Script
# Usage: ./backup-mongodb.sh [backup_dir] [retention_days]

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-/var/backups/mongodb}"
RETENTION_DAYS="${2:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
MONGODB_CONTAINER="sentinel-mongodb-1"
DATABASE_NAME="${MONGODB_DATABASE:-sentinel}"
MONGODB_USER="${MONGODB_USER:-sentinel}"
MONGODB_PASSWORD="${MONGODB_PASSWORD:-}"
MONGODB_AUTH_DB="${MONGODB_AUTH_DB:-admin}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup filename
BACKUP_FILE="$BACKUP_DIR/sentinel_backup_$DATE"

# Check if we're running in Docker Compose
docker_compose_running() {
  docker compose ps >/dev/null 2>&1
  return $?
}

# Check if we're running in standalone Docker
docker_standalone_running() {
  docker ps >/dev/null 2>&1
  return $?
}

# Perform backup using mongodump
echo "[$(date)] Starting MongoDB backup to $BACKUP_FILE"

if docker_compose_running; then
  # Running via docker compose
  docker compose exec -T mongodb mongodump \
    --db "$DATABASE_NAME" \
    --username "$MONGODB_USER" \
    --password "$MONGODB_PASSWORD" \
    --authenticationDatabase "$MONGODB_AUTH_DB" \
    --out "$BACKUP_FILE" \
    --gzip
elif docker_standalone_running; then
  # Running standalone Docker
  docker exec "$MONGODB_CONTAINER" mongodump \
    --db "$DATABASE_NAME" \
    --username "$MONGODB_USER" \
    --password "$MONGODB_PASSWORD" \
    --authenticationDatabase "$MONGODB_AUTH_DB" \
    --out "/tmp/backup_$DATE" \
    --gzip
  
  # Copy from container to host
  docker cp "$MONGODB_CONTAINER:/tmp/backup_$DATE" "$BACKUP_FILE"
  docker exec "$MONGODB_CONTAINER" rm -rf "/tmp/backup_$DATE"
else
  # Running on host with direct access
  mongodump \
    --db "$DATABASE_NAME" \
    --username "$MONGODB_USER" \
    --password "$MONGODB_PASSWORD" \
    --authenticationDatabase "$MONGODB_AUTH_DB" \
    --out "$BACKUP_FILE" \
    --gzip
fi

# Verify backup was created
if [ -d "$BACKUP_FILE/$DATABASE_NAME" ]; then
  echo "[$(date)] Backup completed successfully"
  
  # Create a manifest file with metadata
  cat > "$BACKUP_FILE/backup_manifest.json" <<EOF
{
  "backup_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "database": "$DATABASE_NAME",
  "type": "full",
  "mongodump_version": $(mongodump --version | head -n1 | awk '{print $2}' | tr -d '\n')
}
EOF
  
  echo "[$(date)] Backup manifest created"
else
  echo "[$(date)] ERROR: Backup failed - no output directory created"
  exit 1
fi

# Clean up old backups (retention)
echo "[$(date)] Cleaning up backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -name "sentinel_backup_*" -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true

echo "[$(date)] Backup process completed"
```

#### Make it executable:

```bash
chmod +x scripts/backup-mongodb.sh
```

---

## Restore Procedures

### 1. Full Restore from Backup

#### Prerequisites

- MongoDB service must be running
- Database to restore to must exist (or will be created)
- Sufficient disk space for the backup
- No active connections writing to the database during restore

#### Restore Script: `scripts/restore-mongodb.sh`

```bash
#!/bin/bash
# Sentinel MongoDB Restore Script
# Usage: ./restore-mongodb.sh <backup_dir> [database_name]

set -euo pipefail

# Configuration
BACKUP_DIR="${1:?Please provide backup directory}"
DATABASE_NAME="${2:-sentinel}"
MONGODB_CONTAINER="sentinel-mongodb-1"
MONGODB_USER="${MONGODB_USER:-sentinel}"
MONGODB_PASSWORD="${MONGODB_PASSWORD:-}"
MONGODB_AUTH_DB="${MONGODB_AUTH_DB:-admin}"

# Validate backup directory
echo "[$(date)] Validating backup directory: $BACKUP_DIR"
if [ ! -d "$BACKUP_DIR/$DATABASE_NAME" ]; then
  echo "[$(date)] ERROR: Backup directory does not contain database '$DATABASE_NAME'"
  echo "Contents of $BACKUP_DIR:"
  ls -la "$BACKUP_DIR" || true
  exit 1
fi

# Read manifest if available
if [ -f "$BACKUP_DIR/backup_manifest.json" ]; then
  echo "[$(date)] Backup manifest:"
  cat "$BACKUP_DIR/backup_manifest.json" | jq . || cat "$BACKUP_DIR/backup_manifest.json"
fi

# Check if we're running in Docker Compose
docker_compose_running() {
  docker compose ps >/dev/null 2>&1
  return $?
}

# Check if we're running in standalone Docker
 docker_standalone_running() {
  docker ps >/dev/null 2>&1
  return $?
}

echo "[$(date)] WARNING: Restore will OVERWRITE existing data in database '$DATABASE_NAME'"
echo "[$(date)] Press Ctrl+C to abort within 10 seconds..."
sleep 10

echo "[$(date)] Starting MongoDB restore from $BACKUP_DIR"

if docker_compose_running; then
  # Running via docker compose
  docker compose exec -T mongodb mongorestore \
    --db "$DATABASE_NAME" \
    --username "$MONGODB_USER" \
    --password "$MONGODB_PASSWORD" \
    --authenticationDatabase "$MONGODB_AUTH_DB" \
    --drop \
    "$BACKUP_DIR/$DATABASE_NAME"
    --gzip
elif docker_standalone_running; then
  # Running standalone Docker
  docker cp "$BACKUP_DIR" "$MONGODB_CONTAINER:/tmp/restore"
  docker exec "$MONGODB_CONTAINER" mongorestore \
    --db "$DATABASE_NAME" \
    --username "$MONGODB_USER" \
    --password "$MONGODB_PASSWORD" \
    --authenticationDatabase "$MONGODB_AUTH_DB" \
    --drop \
    "/tmp/restore/$DATABASE_NAME" \
    --gzip
  docker exec "$MONGODB_CONTAINER" rm -rf "/tmp/restore"
else
  # Running on host with direct access
  mongorestore \
    --db "$DATABASE_NAME" \
    --username "$MONGODB_USER" \
    --password "$MONGODB_PASSWORD" \
    --authenticationDatabase "$MONGODB_AUTH_DB" \
    --drop \
    "$BACKUP_DIR/$DATABASE_NAME" \
    --gzip
fi

echo "[$(date)] Restore completed successfully"
```

#### Make it executable:

```bash
chmod +x scripts/restore-mongodb.sh
```

---

## Automated Backup Setup

### Cron Job for Daily Backups

Add to crontab (run `crontab -e`):

```bash
# Daily backup at 02:00 UTC
0 2 * * * /path/to/sentinel/scripts/backup-mongodb.sh /var/backups/mongodb 30

# Weekly backup on Sundays at 03:00 UTC (retention 90 days)
0 3 * * 0 /path/to/sentinel/scripts/backup-mongodb.sh /var/backups/mongodb-weekly 90

# Monthly backup on 1st at 04:00 UTC (retention 365 days)
0 4 1 * * /path/to/sentinel/scripts/backup-mongodb.sh /var/backups/mongodb-monthly 365
```

### Systemd Timer (Alternative)

Create `/etc/systemd/system/mongodb-backup.service`:

```ini
[Unit]
Description=Sentinel MongoDB Backup
After=mongodb.service

[Service]
Type=oneshot
ExecStart=/path/to/sentinel/scripts/backup-mongodb.sh /var/backups/mongodb 30
User=root
Group=root
Environment=MONGODB_USER=sentinel
Environment=MONGODB_PASSWORD=your_password
Environment=MONGODB_AUTH_DB=admin
Environment=MONGODB_DATABASE=sentinel
```

Create `/etc/systemd/system/mongodb-backup.timer`:

```ini
[Unit]
Description=Daily MongoDB Backup Timer

[Timer]
OnCalendar=02:00
Persistent=true

[Install]
WantedBy=timers.target
```

Then enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mongodb-backup.timer
sudo systemctl start mongodb-backup.timer
```

---

## Verification Procedures

### Backup Verification

After creating a backup, verify it:

```bash
# Check backup directory structure
ls -la /var/backups/mongodb/sentinel_backup_YYYYMMDD_HHMMSS/sentinel/

# Verify backup can be listed by mongorestore
mongorestore --listDatabases /var/backups/mongodb/sentinel_backup_YYYYMMDD_HHMMSS/

# Check backup size
du -sh /var/backups/mongodb/
```

### Restore Verification

**WARNING: DO NOT run restore verification on production data without a tested backup.**

To verify restore works (on a test environment):

1. Create a test backup:
   ```bash
   ./scripts/backup-mongodb.sh /tmp/test_backups
   ```

2. Drop the test database (or create a new one):
   ```bash
   docker compose exec mongodb mongosh admin --eval "db.adminCommand({dropDatabase: 'sentinel_test'})"
   ```

3. Restore to test database:
   ```bash
   ./scripts/restore-mongodb.sh /tmp/test_backups sentinel_test
   ```

4. Verify data was restored:
   ```bash
   docker compose exec mongodb mongosh sentinel_test --eval "db.getCollectionNames()"
   docker compose exec mongodb mongosh sentinel_test --eval "db.users.countDocuments()"
   ```

---

## Production Deployment Notes

### Environment Variables

Required environment variables for backup/restore scripts:

```bash
# MongoDB connection
MONGODB_USER=sentinel          # Default MongoDB username
MONGODB_PASSWORD=your_password # MongoDB password
MONGODB_AUTH_DB=admin           # Authentication database
MONGODB_DATABASE=sentinel       # Database to backup
```

### Security Considerations

1. **Backup Encryption:** For production, encrypt backup files:
   ```bash
   # After backup, encrypt
   openssl enc -aes-256-cbc -salt -in backup.tar.gz -out backup.tar.gz.enc -pass pass:your_encryption_key
   
   # Before restore, decrypt
   openssl enc -d -aes-256-cbc -in backup.tar.gz.enc -out backup.tar.gz -pass pass:your_encryption_key
   ```

2. **Secure Storage:** Store backups in encrypted storage with access controls

3. **Key Management:** Use a secrets manager for encryption keys and MongoDB passwords

4. **Network Security:** Ensure backup scripts run over secure connections

### Performance Considerations

1. **Large Databases:** For databases > 10GB, consider:
   - Using `--numParallelCollections` for faster backups
   - Splitting backups by collection
   - Using filesystem snapshots if using a volume manager

2. **Minimal Impact:** Backups can impact performance. Consider:
   - Running during low-traffic periods
   - Using `--quiet` flag to reduce logging overhead
   - Monitoring database performance during backups

---

## Recovery Scenarios

### 1. Single File Corruption

If a single file is corrupted:
- Restore only the affected collections from the most recent backup
- Use `mongorestore --collection` to restore specific collections

### 2. Complete Database Loss

If the entire database is lost:
1. Restore from the most recent full backup
2. Apply any incremental backups since the full backup
3. Replay any transaction logs if available
4. Verify data integrity

### 3. Accidental Data Deletion

If specific data was accidentally deleted:
1. Identify the most recent backup before the deletion
2. Restore that backup to a temporary database
3. Export the deleted data from the temporary database
4. Import the data back to the production database

---

## Monitoring

### Backup Monitoring

Monitor backup success/failure:

```bash
# Check last backup log
tail -n 50 /var/log/mongodb-backup.log

# Check backup directory disk usage
df -h /var/backups

# List recent backups
ls -lt /var/backups/mongodb/ | head -n 10
```

### Alerting

Set up alerts for:
- Failed backup attempts
- Missing backups (no new backup in expected time window)
- Backup storage approaching capacity
- Backup restoration failures during testing

---

## Limitations and Notes

1. **Backup Tooling Only:** This document describes backup and restore procedures and provides tooling. No actual backup has been performed or restored and verified at this time.

2. **Testing Required:** Before relying on these procedures in production, you MUST:
   - Test backup creation on your specific environment
   - Test restore from backups to a test database
   - Verify data integrity after restore
   - Test in your actual production environment (or a staging copy)

3. **Redis Backup:** Redis data (queues, rate limiting) is NOT backed up by these scripts. For Redis backup, use:
   ```bash
   # Save Redis data
   docker compose exec redis redis-cli SAVE
   
   # Or copy RDB file
   docker cp sentinel-redis-1:/data/dump.rdb /var/backups/redis/
   ```

4. **Configuration Backup:** Database configuration, indexes, and users are included in the backup. However, server configuration files (docker-compose.yml, .env, etc.) should be backed up separately using version control or configuration management.

5. **Point-in-Time Recovery:** For production deployments requiring point-in-time recovery, consider:
   - MongoDB replica sets with oplog
   - MongoDB Atlas continuous backup
   - Third-party backup solutions with PITR support

---

## Quick Reference Commands

| Task | Command |
|------|---------|
| Manual backup | `./scripts/backup-mongodb.sh /var/backups/mongodb` |
| Manual restore | `./scripts/restore-mongodb.sh /var/backups/mongodb/sentinel_backup_YYYYMMDD_HHMMSS` |
| List backups | `ls -la /var/backups/mongodb/` |
| Verify backup | `mongorestore --listDatabases /var/backups/mongodb/sentinel_backup_YYYYMMDD_HHMMSS/` |
| Check backup size | `du -sh /var/backups/mongodb/` |

---

## Contact and Support

For issues with backup/restore procedures:
- Check the troubleshooting section below
- Review logs in `/var/log/`
- Verify environment variables are set correctly

## Troubleshooting

### Backup Fails with Authentication Error

**Symptom:** `Authentication failed` or similar error

**Solution:**
1. Verify MongoDB credentials in environment variables
2. Check if MongoDB user has appropriate permissions
3. Test connection manually: `mongosh "mongodb://user:password@localhost:27017/db?authSource=admin"`

### Backup Fails with Connection Error

**Symptom:** Cannot connect to MongoDB

**Solution:**
1. Check if MongoDB container is running: `docker compose ps`
2. Test direct connection: `docker compose exec mongodb mongosh`
3. Check network connectivity between host and MongoDB container

### Restore Fails with Database Not Found

**Symptom:** Target database doesn't exist

**Solution:**
1. Create the database first: `mongosh admin --eval "use sentinel"`
2. Or use `--drop` flag to create it automatically during restore

### Insufficient Disk Space

**Symptom:** `No space left on device`

**Solution:**
1. Clean old backups: `find /var/backups -name "sentinel_backup_*" -mtime +30 -exec rm -rf {} +`
2. Increase disk space
3. Use external storage

### Backup Takes Too Long

**Symptom:** Backup hangs or takes excessive time

**Solution:**
1. Run during low-traffic periods
2. Use `--numParallelCollections` for parallel backup
3. Consider splitting into smaller, more frequent backups

---

*Last updated: 2026-10-22*
*Version: 1.0*

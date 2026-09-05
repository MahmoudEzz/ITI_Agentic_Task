#!/bin/sh
# Runs automatically on first container init (postgres's official image
# executes every script in /docker-entrypoint-initdb.d/ once, against an
# empty data volume, per docker-compose.yml's `postgres` service mount).
#
# A second database, not a second Postgres instance: `npm run ingest`
# writes real corpus data to $POSTGRES_DB; integration tests need their own
# database to truncate freely without wiping that data out from under it
# (issue #35). Same server, same pgvector image, so both get the extension
# and HNSW support the schema migrations need.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE ${POSTGRES_DB}_test;
EOSQL

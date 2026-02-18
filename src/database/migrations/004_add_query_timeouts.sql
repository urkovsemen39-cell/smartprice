-- Migration: Add Query Timeouts
-- Date: 2026-02-18
-- Description: Adds statement timeouts to prevent long-running queries

ALTER DATABASE smartprice SET statement_timeout = '30s';
ALTER DATABASE smartprice SET idle_in_transaction_session_timeout = '60s';
ALTER DATABASE smartprice SET lock_timeout = '10s';
ALTER DATABASE smartprice SET log_min_duration_statement = 1000;
ALTER DATABASE smartprice SET track_activities = on;
ALTER DATABASE smartprice SET track_counts = on;
ALTER DATABASE smartprice SET track_io_timing = on;

-- Clear all IP blocks
DELETE FROM ip_blacklist;

-- Verify
SELECT COUNT(*) as remaining_blocks FROM ip_blacklist;

CREATE DATABASE purchasing_dev;
CREATE DATABASE purchasing_test;
\connect purchasing_dev
CREATE EXTENSION IF NOT EXISTS pg_trgm;
\connect purchasing_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;

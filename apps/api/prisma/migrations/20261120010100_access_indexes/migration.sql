CREATE INDEX "User_name_search" ON "User" USING gin ("name" gin_trgm_ops);
CREATE INDEX "User_username_search" ON "User" USING gin ("username" gin_trgm_ops);
CREATE INDEX "User_support_active" ON "User" ("isSuperadmin", "isActive");
-- The application can append history, including the actor's name at the time.
CREATE FUNCTION reject_audit_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION reject_audit_rewrite();

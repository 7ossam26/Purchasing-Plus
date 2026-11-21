-- Timeline events are append-only except when a draft is hard-deleted.
CREATE FUNCTION protect_request_event() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' AND NOT EXISTS (
        SELECT 1 FROM "Request" WHERE "id" = OLD."requestId"
    ) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Request events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RequestEvent_append_only"
BEFORE UPDATE OR DELETE ON "RequestEvent"
FOR EACH ROW EXECUTE FUNCTION protect_request_event();

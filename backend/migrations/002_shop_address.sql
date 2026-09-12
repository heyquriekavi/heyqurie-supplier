-- Setup page asks for the address and can take it from the phone's location.
ALTER TABLE shops ADD COLUMN address TEXT;
ALTER TABLE shops ADD COLUMN lat REAL;
ALTER TABLE shops ADD COLUMN lng REAL;

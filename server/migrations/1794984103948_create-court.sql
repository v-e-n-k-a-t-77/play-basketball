-- Up Migration

CREATE TABLE courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  address text NOT NULL CHECK (char_length(address) BETWEEN 5 AND 200),
  area text NOT NULL,
  city text NOT NULL DEFAULT 'Hyderabad',
  location geography(Point, 4326) NOT NULL,
  surface court_surface NOT NULL DEFAULT 'OUTDOOR_CONCRETE',
  has_lights boolean NOT NULL DEFAULT false,
  is_free boolean NOT NULL DEFAULT true,
  hoops_count smallint NOT NULL DEFAULT 2 CHECK (hoops_count BETWEEN 1 AND 20),
  photo_url text,
  notes text CHECK (char_length(notes) <= 500),
  status court_status NOT NULL DEFAULT 'PENDING',
  rejection_reason text,
  created_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_courts_location ON courts USING GIST (location);
CREATE INDEX idx_courts_status ON courts(status);
CREATE INDEX idx_courts_area ON courts(lower(area));

CREATE TRIGGER trg_courts_updated BEFORE UPDATE ON courts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS courts;
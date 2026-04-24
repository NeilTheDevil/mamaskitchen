CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(12) NOT NULL UNIQUE,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    delivery_address TEXT NOT NULL,
    notes TEXT,
    items JSONB NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'preparing', 'out_for_delivery', 'delivered', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_lat NUMERIC(9, 6);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_lng NUMERIC(9, 6);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_location_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_number     ON orders (order_number);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Menu admin + delivery coords (Task 1: 2026-04-24-menu-admin-and-map-polish)

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(9, 6);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(9, 6);

CREATE TABLE IF NOT EXISTS menu_items (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    emoji VARCHAR(16) NOT NULL DEFAULT '🍽️',
    bg VARCHAR(64) NOT NULL DEFAULT 'from-stone-400 to-stone-500',
    available BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_sort ON menu_items (sort_order, name);

DROP TRIGGER IF EXISTS trg_menu_items_updated_at ON menu_items;
CREATE TRIGGER trg_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO menu_items (id, name, description, price, emoji, bg, sort_order) VALUES
  ('jollof-chicken',    'Jollof Rice & Chicken',  'Smoky party jollof with grilled chicken',   3500, '🍛', 'from-rose-400 to-orange-500',   10),
  ('fried-rice-beef',   'Fried Rice & Beef',      'Veggie-loaded fried rice with tender beef', 3200, '🍚', 'from-amber-400 to-lime-500',    20),
  ('amala-ewedu',       'Amala & Ewedu',          'Yam flour swallow with ewedu and stew',     2800, '🥣', 'from-emerald-400 to-teal-500',  30),
  ('pounded-yam-egusi', 'Pounded Yam & Egusi',    'Soft pounded yam with melon seed soup',     3000, '🫕', 'from-yellow-400 to-amber-500',  40),
  ('suya-platter',      'Suya Platter',           'Spicy grilled beef, onions & yaji',         4000, '🍢', 'from-red-500 to-rose-600',      50),
  ('moi-moi',           'Moi Moi',                'Steamed beans pudding with egg & fish',     1500, '🥮', 'from-orange-400 to-red-500',    60),
  ('puff-puff',         'Puff Puff (10 pcs)',     'Soft, golden, dusted with sugar',           1000, '🍩', 'from-pink-400 to-rose-500',     70),
  ('zobo',              'Zobo Drink (500ml)',     'Hibiscus drink with ginger & pineapple',     800, '🥤', 'from-fuchsia-500 to-purple-600',80)
ON CONFLICT (id) DO NOTHING;

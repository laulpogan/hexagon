-- Complete Supabase Setup for Hex Tile Game Multiplayer
-- Run this in your Supabase SQL Editor at https://supabase.com/dashboard

-- 1. Create rooms table for multiplayer games
CREATE TABLE IF NOT EXISTS rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    game_state JSONB DEFAULT '{
        "currentPlayer": 1,
        "gamePhase": "capital_placement",
        "boardTiles": [],
        "playersReady": {"1": false, "2": false},
        "currentTurn": 1,
        "score": {"1": 0, "2": 0}
    }',
    player1_id TEXT,
    player2_id TEXT,
    current_player INTEGER DEFAULT 1,
    game_phase TEXT DEFAULT 'capital_placement',
    is_active BOOLEAN DEFAULT true
);

-- 2. Create players table
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    player_number INTEGER CHECK (player_number IN (1, 2)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_is_active ON rooms(is_active);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_player_number ON players(player_number);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- 5. Create policies for public access (since this is a game)
CREATE POLICY "Allow public read access to rooms" ON rooms
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to rooms" ON rooms
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to rooms" ON rooms
    FOR UPDATE USING (true);

CREATE POLICY "Allow public delete access to rooms" ON rooms
    FOR DELETE USING (true);

CREATE POLICY "Allow public read access to players" ON players
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to players" ON players
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to players" ON players
    FOR UPDATE USING (true);

CREATE POLICY "Allow public delete access to players" ON players
    FOR DELETE USING (true);

-- 6. Enable real-time subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;

-- 7. Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 8. Create trigger to automatically update updated_at
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Create a function to clean up old inactive rooms (optional)
CREATE OR REPLACE FUNCTION cleanup_old_rooms()
RETURNS void AS $$
BEGIN
    DELETE FROM rooms 
    WHERE is_active = false 
    AND created_at < NOW() - INTERVAL '24 hours';
END;
$$ language 'plpgsql';

-- 10. Create a view for active rooms with player count
CREATE OR REPLACE VIEW active_rooms AS
SELECT 
    r.id,
    r.room_code,
    r.created_at,
    r.game_phase,
    r.current_player,
    CASE 
        WHEN r.player1_id IS NOT NULL AND r.player2_id IS NOT NULL THEN 2
        WHEN r.player1_id IS NOT NULL OR r.player2_id IS NOT NULL THEN 1
        ELSE 0
    END as player_count,
    r.is_active
FROM rooms r
WHERE r.is_active = true;

-- 11. Insert some test data (optional)
INSERT INTO rooms (room_code, player1_id, game_state) VALUES 
('DEMO123', 'test-player-1', '{
    "currentPlayer": 1,
    "gamePhase": "capital_placement",
    "boardTiles": [],
    "playersReady": {"1": false, "2": false},
    "currentTurn": 1,
    "score": {"1": 0, "2": 0}
}') ON CONFLICT (room_code) DO NOTHING;

-- 12. Verify the setup
SELECT 'Setup complete! Tables created successfully.' as status;
SELECT 'rooms' as table_name, count(*) as row_count FROM rooms
UNION ALL
SELECT 'players' as table_name, count(*) as row_count FROM players;

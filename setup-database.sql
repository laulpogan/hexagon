-- Supabase Database Setup for Hex Tile Game Multiplayer
-- Run this in your Supabase SQL Editor

-- Create a rooms table for multiplayer games
CREATE TABLE IF NOT EXISTS rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    game_state JSONB DEFAULT '{}',
    player1_id TEXT,
    player2_id TEXT,
    current_player INTEGER DEFAULT 1,
    game_phase TEXT DEFAULT 'capital_placement',
    is_active BOOLEAN DEFAULT true
);

-- Create a players table
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    player_number INTEGER CHECK (player_number IN (1, 2)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_is_active ON rooms(is_active);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_player_number ON players(player_number);

-- Enable Row Level Security (RLS)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since this is a game)
CREATE POLICY "Allow public read access to rooms" ON rooms
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to rooms" ON rooms
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to rooms" ON rooms
    FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to players" ON players
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to players" ON players
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to players" ON players
    FOR UPDATE USING (true);

-- Enable real-time subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

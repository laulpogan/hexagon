# Supabase Setup Guide

## 1. Get Your Project Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** (looks like `https://your-project-id.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

## 2. Update Your HTML File

Edit `hex-tile-game-multiplayer.html` and replace these lines:

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

With your actual values:

```javascript
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

## 3. Set Up Database Tables (Optional)

If you want to use Supabase for real-time multiplayer, you'll need to create some tables. You can do this in the Supabase SQL Editor:

```sql
-- Create a rooms table for multiplayer games
CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    room_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    game_state JSONB,
    player1_id TEXT,
    player2_id TEXT,
    current_player INTEGER DEFAULT 1,
    game_phase TEXT DEFAULT 'capital_placement'
);

-- Create a players table
CREATE TABLE players (
    id TEXT PRIMARY KEY,
    room_id TEXT REFERENCES rooms(id),
    player_number INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 4. Test Your Connection

Once you've updated the credentials, open `hex-tile-game-multiplayer.html` in your browser and check the browser console for any connection errors.

## 5. Enable Real-time (Optional)

In your Supabase dashboard:
1. Go to **Database** → **Replication**
2. Enable real-time for the `rooms` table
3. This will allow real-time updates for multiplayer functionality

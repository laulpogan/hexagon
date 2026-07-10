# 🎮 Supabase Setup Guide for Hex Tile Game

## Quick Start

1. **Set up Database Tables**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Select your project
   - Go to **SQL Editor**
   - Copy and paste the contents of `supabase-setup-complete.sql`
   - Click **Run**

2. **Test the Setup**
   - Open `http://localhost:8000/test-database.html` in your browser
   - Click "Test Connection" to verify everything works
   - Try creating and joining rooms

3. **Play Multiplayer**
   - Open `http://localhost:8000/hex-tile-game-multiplayer.html` in two browser windows
   - Create a room in one window, join it in the other
   - Enjoy real-time multiplayer gameplay!

## Files Created

- `supabase-setup-complete.sql` - Complete database setup script
- `test-database.html` - Comprehensive database testing page
- `hex-tile-game-multiplayer.html` - Updated with full Supabase integration
- `supabase-config.js` - Configuration file with your credentials

## Database Schema

### Tables Created:
- **rooms** - Stores multiplayer game rooms
- **players** - Stores player information for each room

### Key Features:
- Real-time subscriptions enabled
- Row Level Security (RLS) configured
- Automatic timestamp updates
- Performance indexes
- Cleanup functions for old rooms

## Testing Your Setup

### 1. Connection Test
```bash
# Test basic connection
curl -s "https://hbklikgmdfekwroqbwtf.supabase.co/rest/v1/" \
  -H "apikey: YOUR_ANON_KEY"
```

### 2. Database Test Page
Open `test-database.html` and run through all the test buttons:
- Test Connection
- Test Room Creation  
- Test Room Join
- Cleanup Test Data

### 3. Multiplayer Test
1. Open two browser windows
2. In window 1: Click "Create Room" with code "DEMO123"
3. In window 2: Click "Join Room" with code "DEMO123"
4. Both players should see the game board
5. Take turns placing tiles and see real-time updates!

## Troubleshooting

### Common Issues:

1. **"relation does not exist" error**
   - Make sure you ran the SQL setup script
   - Check that tables were created in the correct schema

2. **"permission denied" error**
   - Verify RLS policies are set up correctly
   - Check that your anon key has the right permissions

3. **Real-time not working**
   - Ensure real-time is enabled for the tables
   - Check that you're subscribed to the right channel

4. **Connection refused**
   - Verify your Supabase URL and anon key are correct
   - Check that your project is active

### Debug Commands:

```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('rooms', 'players');

-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies WHERE tablename IN ('rooms', 'players');

-- Check real-time subscriptions
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

## Next Steps

Once everything is working:
1. Customize the game rules in `hex-tile-game-multiplayer.html`
2. Add more game features (scoring, win conditions, etc.)
3. Deploy to a hosting service
4. Add user authentication if needed
5. Implement game history and statistics

## Support

If you run into issues:
1. Check the browser console for error messages
2. Use the test page to isolate the problem
3. Check the Supabase dashboard logs
4. Verify your database setup matches the schema

Happy gaming! 🎮✨

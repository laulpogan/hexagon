// Supabase multiplayer — action-log relay on a deterministic core.
// Both clients build the same Game from the row's seed + deck compositions,
// then replay each other's actions from the append-only `actions` log.
// Durable (refresh-safe on the wire), ordered (log index), tiny payloads.

const SUPABASE_URL = 'https://kghzdnspdsxrheuckizp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TTNv39Gsg8o20dmCOj2lfQ_rttaEvPR'; // client-safe by design

function client() {
  if (!window.supabase) throw new Error('supabase-js not loaded');
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export class NetSession {
  constructor(sb, row, role) {
    this.sb = sb;
    this.roomId = row.id;
    this.roomCode = row.room_code;
    this.seed = row.seed;
    this.role = role;               // 1 = host (Verdant), 2 = guest (Umbral)
    this.appliedCount = Array.isArray(row.actions) ? row.actions.length : 0;
    this.localLog = Array.isArray(row.actions) ? [...row.actions] : [];
    this.onAction = null;           // cb(action) for each unseen remote action
    this.onGuestJoined = null;      // host-side: cb(guestDeck)
    this.channel = null;
  }

  static async host(roomCode, deckComp) {
    const sb = client();
    const seed = `limen-${Math.random().toString(36).slice(2, 12)}`;
    const { data, error } = await sb
      .from('limen_rooms')
      .insert([{ room_code: roomCode, seed, host_deck: deckComp, status: 'waiting' }])
      .select()
      .single();
    if (error) throw new Error(`Could not create room: ${error.message}`);
    const session = new NetSession(sb, data, 1);
    session.hostDeck = data.host_deck; // row values are the wire truth for both clients
    session._subscribe();
    return session;
  }

  static async join(roomCode, deckComp) {
    const sb = client();
    const { data: row, error } = await sb
      .from('limen_rooms')
      .select('*')
      .eq('room_code', roomCode)
      .eq('status', 'waiting')
      .maybeSingle();
    if (error) throw new Error(`Lookup failed: ${error.message}`);
    if (!row) throw new Error('Room not found (or already full)');
    const { data: updated, error: updErr } = await sb
      .from('limen_rooms')
      .update({ guest_deck: deckComp || {}, status: 'playing' })
      .eq('id', row.id)
      .eq('status', 'waiting') // guard against double-join race
      .select()
      .maybeSingle();
    if (updErr || !updated) throw new Error('Could not join — someone beat you to it');
    const session = new NetSession(sb, updated, 2);
    session.hostDeck = updated.host_deck;
    session.guestDeck = updated.guest_deck;
    session._subscribe();
    return { session, hostDeck: updated.host_deck, seed: updated.seed };
  }

  _subscribe() {
    this.channel = this.sb
      .channel(`limen-${this.roomId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'limen_rooms', filter: `id=eq.${this.roomId}` },
        (payload) => this._handleUpdate(payload.new))
      .subscribe();
  }

  _handleUpdate(row) {
    if (this.role === 1 && row.status === 'playing' && this.onGuestJoined) {
      const cb = this.onGuestJoined;
      this.onGuestJoined = null; // fire once
      cb(row.guest_deck);
    }
    const actions = Array.isArray(row.actions) ? row.actions : [];
    while (this.appliedCount < actions.length) {
      const action = actions[this.appliedCount];
      this.appliedCount++;
      this.localLog.push(action);
      // Own actions were already applied locally before sending — skip.
      if (action.p !== this.role && this.onAction) this.onAction(action);
    }
  }

  // Called AFTER the action was applied to the local game (the sender is the
  // turn owner, so there is no write contention on the log).
  async sendAction(action) {
    action.p = this.role;
    this.localLog.push(action);
    this.appliedCount++;
    const { error } = await this.sb
      .from('limen_rooms')
      .update({ actions: this.localLog })
      .eq('id', this.roomId);
    if (error) console.error('Failed to sync action:', error.message);
    return !error;
  }

  async finish() {
    await this.sb.from('limen_rooms').update({ status: 'done' }).eq('id', this.roomId);
  }

  leave() {
    if (this.channel) this.channel.unsubscribe();
  }
}

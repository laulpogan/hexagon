// Account modal — guest state, email upgrade, magic-link sign-in, sign-out.
// SHELL_SPEC.md §7.2, auth flow amendments B7.
import { currentUser, upgradeToEmail, signInWithMagicLink, isAlreadyRegisteredError, startFreshGuest } from '../net/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initAccount(overlayEl) {
  function close() { overlayEl.classList.add('hidden'); }
  function open() { overlayEl.classList.remove('hidden'); render(); }

  async function render() {
    const user = await currentUser();
    const email = user?.email || null;

    overlayEl.innerHTML = `
      <div class="win-box acct-box">
        <h2>Account</h2>
        <p class="acct-state">${email
          ? `Signed in as <b>${escapeHtml(email)}</b>`
          : 'Playing as guest — your progress lives in this browser.'}</p>
        ${!email ? `
          <div class="acct-form">
            <label for="acctEmail">Save your progress</label>
            <input id="acctEmail" type="email" placeholder="you@example.com" autocomplete="email">
            <button id="acctSaveBtn">Send magic link</button>
          </div>
          <div class="acct-alt"><a href="#" id="acctSignInLink">Already have an account? Sign in with a magic link</a></div>
          <div id="acctMsg" class="acct-msg"></div>
        ` : `
          <button id="acctSignOutBtn">Sign out &amp; start fresh guest session</button>
        `}
        <button id="acctCloseBtn">Close</button>
      </div>`;

    const msgEl = overlayEl.querySelector('#acctMsg');
    const saveBtn = overlayEl.querySelector('#acctSaveBtn');

    if (saveBtn) {
      saveBtn.onclick = async () => {
        const input = overlayEl.querySelector('#acctEmail');
        const val = input.value.trim();
        if (!EMAIL_RE.test(val)) {
          msgEl.textContent = 'Enter a valid email address.';
          msgEl.className = 'acct-msg bad';
          return;
        }
        saveBtn.disabled = true;
        msgEl.textContent = 'Sending…';
        msgEl.className = 'acct-msg';
        try {
          // With an active session (anonymous or already email) this
          // upgrades it in place, preserving auth.uid() and everything
          // owned. Without one (anonymous sign-ins are OFF tonight, so
          // most guests have none) it falls back to a plain magic-link
          // sign-up — a fresh account, local browser progress stays local
          // (documented, SHELL_SPEC §9 second-device row).
          const hasSession = !!(await currentUser());
          const { error } = hasSession ? await upgradeToEmail(val) : await signInWithMagicLink(val);
          if (error && isAlreadyRegisteredError(error)) {
            msgEl.textContent = 'That email already has an account — sign in with a magic link instead.';
            msgEl.className = 'acct-msg bad';
          } else if (error) {
            msgEl.textContent = error.message;
            msgEl.className = 'acct-msg bad';
          } else {
            msgEl.textContent = 'Check your email in a few minutes for a sign-in link.';
            msgEl.className = 'acct-msg ok';
          }
        } catch {
          msgEl.textContent = "Offline — try again once you're connected.";
          msgEl.className = 'acct-msg bad';
        }
        saveBtn.disabled = false;
      };
    }

    const signInLink = overlayEl.querySelector('#acctSignInLink');
    if (signInLink) {
      signInLink.onclick = async (e) => {
        e.preventDefault();
        const input = overlayEl.querySelector('#acctEmail');
        const val = input.value.trim();
        if (!EMAIL_RE.test(val)) {
          msgEl.textContent = 'Enter your email above first.';
          msgEl.className = 'acct-msg bad';
          return;
        }
        msgEl.textContent = 'Sending…';
        msgEl.className = 'acct-msg';
        try {
          const { error } = await signInWithMagicLink(val);
          msgEl.textContent = error ? error.message : 'Check your email in a few minutes for a sign-in link.';
          msgEl.className = 'acct-msg ' + (error ? 'bad' : 'ok');
        } catch {
          msgEl.textContent = "Offline — try again once you're connected.";
          msgEl.className = 'acct-msg bad';
        }
      };
    }

    const signOutBtn = overlayEl.querySelector('#acctSignOutBtn');
    if (signOutBtn) {
      signOutBtn.onclick = async () => {
        signOutBtn.disabled = true;
        await startFreshGuest();
        close();
        location.reload(); // simplest correct reset back to a clean guest boot
      };
    }

    overlayEl.querySelector('#acctCloseBtn').onclick = close;
  }

  return { open, close };
}

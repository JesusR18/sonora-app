/* Cuentas: entrar, crear cuenta, Google, recuperar contraseña y editar el perfil. */
import { $, esc } from '../core/dom.js';
import { sb, auth, onAuth, connected, isAdmin, refreshProfile } from '../core/supa.js';
import { openModal, closeModal } from '../ui/modal.js';
import { avatar, toast, errMsg } from './util.js';

let mode = 'login'; // login | signup | reset

function setMode(m) {
  mode = m;
  const f = $('#authForm');
  $$tab().forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  f.querySelector('[name=name]').closest('label').hidden = m !== 'signup';
  f.querySelector('[name=password]').closest('label').hidden = m === 'reset';
  f.querySelector('[name=password]').required = m !== 'reset';
  f.querySelector('[name=password]').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
  $('#authSubmit').textContent = { login: 'Entrar', signup: 'Crear cuenta', reset: 'Enviar enlace' }[m];
  $('#authForgot').hidden = m !== 'login';
  $('#authMsg').textContent = m === 'reset' ? 'Te mandamos un enlace para entrar y cambiar tu contraseña.' : '';
}
const $$tab = () => [...document.querySelectorAll('#authTabs [data-mode]')];

/** Abre la ventana para entrar. `reason` explica por qué se pide (ej. "para comentar"). */
export function openAuth(reason) {
  $('#authReason').textContent = reason ? `Inicia sesión ${reason}.` : 'Comenta, reacciona, vota y reseña tus discos favoritos.';
  $('#authOffline').hidden = connected();
  $('#authForm').hidden = !connected();
  setMode('login');
  openModal($('#authModal'));
}

async function submitAuth(e) {
  e.preventDefault();
  const f = e.target, btn = $('#authSubmit');
  const email = f.email.value.trim(), password = f.password.value, name = f.name.value.trim();
  btn.disabled = true;
  $('#authMsg').textContent = '';
  try {
    if (mode === 'login') {
      const { error } = await sb().auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeModal($('#authModal'));
      toast('¡Bienvenido de vuelta!');
    } else if (mode === 'signup') {
      const { data, error } = await sb().auth.signUp({ email, password, options: { data: { full_name: name || email.split('@')[0] }, emailRedirectTo: location.origin } });
      if (error) throw error;
      if (data.session) { closeModal($('#authModal')); toast('¡Cuenta creada!'); }
      else $('#authMsg').textContent = 'Listo. Revisa tu correo y confirma tu cuenta para entrar.';
    } else {
      const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/#perfil' });
      if (error) throw error;
      $('#authMsg').textContent = 'Si existe una cuenta con ese correo, te llegará un enlace en unos minutos.';
    }
  } catch (err) {
    $('#authMsg').textContent = errMsg(err);
  } finally { btn.disabled = false; }
}

async function google() {
  const { error } = await sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  if (error) $('#authMsg').textContent = /provider is not enabled/i.test(error.message) ? 'El inicio con Google todavía no está activado en Supabase.' : errMsg(error);
}

/* ---------- Perfil ---------- */

function openProfile() {
  const p = auth.profile || {};
  const f = $('#profileForm');
  f.display_name.value = p.display_name || '';
  f.username.value = p.username || '';
  f.bio.value = p.bio || '';
  f.avatar_url.value = p.avatar_url || '';
  $('#profileEmail').textContent = auth.user?.email || '';
  $('#profileAvatar').innerHTML = avatar(p, 64);
  $('#profileRole').hidden = !isAdmin();
  $('#adminTools').hidden = !isAdmin();
  $('#profileMsg').textContent = '';
  $('#passwordBox').hidden = !location.hash.includes('perfil');
  openModal($('#profileModal'));
}

async function saveProfile(e) {
  e.preventDefault();
  const f = e.target;
  const row = {
    display_name: f.display_name.value.trim() || 'Oyente',
    username: f.username.value.trim().toLowerCase() || null,
    bio: f.bio.value.trim() || null,
    avatar_url: f.avatar_url.value.trim() || null
  };
  if (row.username && !/^[a-z0-9_]{3,24}$/.test(row.username)) { $('#profileMsg').textContent = 'El usuario lleva de 3 a 24 letras, números o guion bajo.'; return; }
  if (row.avatar_url && !/^https:\/\//.test(row.avatar_url)) { $('#profileMsg').textContent = 'La foto debe ser un enlace https://'; return; }
  const { error } = await sb().from('profiles').update(row).eq('id', auth.user.id);
  if (error) { $('#profileMsg').textContent = errMsg(error); return; }
  const pw = f.new_password?.value;
  if (pw) {
    const { error: e2 } = await sb().auth.updateUser({ password: pw });
    if (e2) { $('#profileMsg').textContent = errMsg(e2); return; }
    f.new_password.value = '';
  }
  await refreshProfile();
  closeModal($('#profileModal'));
  toast('Perfil guardado');
}

async function signOut() {
  await sb().auth.signOut();
  closeModal($('#profileModal'));
  toast('Sesión cerrada');
}

/** Botón de la barra: "Entrar" o el avatar de la persona. */
function renderNavButton() {
  const btn = $('#authBtn');
  if (auth.user) {
    btn.innerHTML = `${avatar(auth.profile, 24)}<span class="auth-name">${esc(auth.profile?.display_name || 'Mi perfil')}</span>`;
    btn.setAttribute('aria-label', 'Mi perfil');
    btn.classList.add('signed');
  } else {
    btn.textContent = 'Entrar';
    btn.removeAttribute('aria-label');
    btn.classList.remove('signed');
  }
  $('#menuAuth').textContent = auth.user ? 'Mi perfil' : 'Entrar';
  document.body.classList.toggle('is-admin', isAdmin());
  document.body.classList.toggle('signed-in', !!auth.user);
}

export function initAuth() {
  $('#authBtn').addEventListener('click', () => (auth.user ? openProfile() : openAuth()));
  $('#menuAuth').addEventListener('click', () => (auth.user ? openProfile() : openAuth()));
  $$tab().forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#authForgot').addEventListener('click', () => setMode('reset'));
  $('#authForm').addEventListener('submit', submitAuth);
  $('#authGoogle').addEventListener('click', google);
  $('#profileForm').addEventListener('submit', saveProfile);
  $('#signOut').addEventListener('click', signOut);
  document.addEventListener('sonora:login', e => openAuth(e.detail));
  onAuth(a => {
    renderNavButton();
    // Al volver del correo de "olvidé mi contraseña" se abre el perfil para cambiarla
    if (a.user && location.hash.includes('perfil') && $('#profileModal').hidden) openProfile();
  });
}

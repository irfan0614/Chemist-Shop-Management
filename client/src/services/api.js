const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

function getAuthHeader() {
  const token = localStorage.getItem('chemist_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  async get(path) {
    const r = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
    });
    if (!r.ok) {
      let err = `GET ${path} failed (${r.status})`;
      try { const res = await r.json(); if (res.error) err = res.error; } catch (e) {}
      throw new Error(err);
    }
    return r.json();
  },

  async post(path, body) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) {
      let err = `POST ${path} failed (${r.status})`;
      try { const res = await r.json(); if (res.error) err = res.error; } catch (e) {}
      throw new Error(err);
    }
    return r.json();
  },

  async put(path, body) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) {
      let err = `PUT ${path} failed (${r.status})`;
      try { const res = await r.json(); if (res.error) err = res.error; } catch (e) {}
      throw new Error(err);
    }
    return r.json();
  },

  async del(path) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader(),
      },
    });
    if (!r.ok) {
      let err = `DELETE ${path} failed (${r.status})`;
      try { const res = await r.json(); if (res.error) err = res.error; } catch (e) {}
      throw new Error(err);
    }
    if (r.status === 204) return null;
    return r.json();
  },
};

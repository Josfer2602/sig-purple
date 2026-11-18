import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const TOKENS_FILE = path.join(__dirname, '../../google-calendar-tokens.json');

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  meetLink: string;
  htmlLink: string;
  status: string;
  attendees: { email: string; name?: string; responseStatus?: string }[];
  creator?: { email?: string; displayName?: string };
}

export function getOAuth2Client(redirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const finalRedirectUri = redirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:52823/api/auth/google/callback';

  return new google.auth.OAuth2(clientId, clientSecret, finalRedirectUri);
}

export function getStoredTokens(userEmail?: string) {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = fs.readFileSync(TOKENS_FILE, 'utf8');
      const json = JSON.parse(data);

      if (userEmail) {
        const normalized = userEmail.toLowerCase().trim();
        if (json.users && json.users[normalized]) {
          return json.users[normalized];
        }
        if (json.email && json.email.toLowerCase().trim() === normalized) {
          return json;
        }
      }

      // Default or legacy single-user
      if (json.access_token || json.refresh_token) return json;
      if (json.default) return json.default;
      if (json.users && Object.keys(json.users).length > 0) {
        const firstUser = Object.keys(json.users)[0];
        return json.users[firstUser];
      }
    }
  } catch (err) {
    console.error('Error reading calendar tokens:', err);
  }
  return null;
}

export function saveTokens(tokens: any, userEmail?: string) {
  try {
    let currentStore: any = {};
    if (fs.existsSync(TOKENS_FILE)) {
      try {
        currentStore = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
      } catch (e) {
        currentStore = {};
      }
    }

    const email = (userEmail || tokens.email || '').toLowerCase().trim();
    if (email) {
      if (!currentStore.users) currentStore.users = {};
      currentStore.users[email] = {
        ...currentStore.users[email],
        ...tokens,
        email
      };
      currentStore.default = currentStore.users[email];
    } else {
      currentStore.default = { ...currentStore.default, ...tokens };
    }

    fs.writeFileSync(TOKENS_FILE, JSON.stringify(currentStore, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving calendar tokens:', err);
  }
}

export function deleteTokens(userEmail?: string) {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      if (userEmail) {
        const currentStore = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
        const normalized = userEmail.toLowerCase().trim();
        if (currentStore.users && currentStore.users[normalized]) {
          delete currentStore.users[normalized];
        }
        if (currentStore.default?.email?.toLowerCase().trim() === normalized) {
          delete currentStore.default;
        }
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(currentStore, null, 2), 'utf8');
      } else {
        fs.unlinkSync(TOKENS_FILE);
      }
    }
  } catch (err) {
    console.error('Error deleting calendar tokens:', err);
  }
}

export function getCalendarAuthUrl(options?: { frontendUrl?: string; action?: 'login' | 'calendar' | 'drive'; redirectUri?: string }) {
  const oauth2Client = getOAuth2Client(options?.redirectUri);
  const stateObj = {
    frontendUrl: options?.frontendUrl || 'http://localhost:52824',
    action: options?.action || 'calendar',
    redirectUri: options?.redirectUri
  };

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive'
    ],
    state: JSON.stringify(stateObj)
  });
}

export async function exchangeCodeForTokens(code: string, redirectUri?: string) {
  const oauth2Client = getOAuth2Client(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Get user profile info
  let userEmail = 'directorio@purplebtl.com';
  let userName = 'Directorio';
  let userPicture = '';
  let hostedDomain = '';

  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userRes = await oauth2.userinfo.get();
    if (userRes.data?.email) userEmail = userRes.data.email;
    if (userRes.data?.name) userName = userRes.data.name;
    if (userRes.data?.picture) userPicture = userRes.data.picture;
    if (userRes.data?.hd) hostedDomain = userRes.data.hd;
  } catch (e) {
    console.warn('Could not fetch userinfo, using default:', e);
  }

  const tokenData = {
    ...tokens,
    email: userEmail,
    name: userName,
    picture: userPicture,
    hd: hostedDomain,
    connectedAt: new Date().toISOString()
  };

  saveTokens(tokenData, userEmail);
  return tokenData;
}

export async function getCalendarEvents(options?: { userEmail?: string; timeMin?: string; timeMax?: string; maxResults?: number }) {
  const stored = getStoredTokens(options?.userEmail);
  if (!stored || (!stored.access_token && !stored.refresh_token)) {
    return { connected: false, events: [] };
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(stored);

  // Auto-persist refreshed tokens for this specific user
  oauth2Client.on('tokens', (newTokens) => {
    saveTokens(newTokens, stored.email);
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Default: from start of today to 14 days ahead
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const timeMin = options?.timeMin || startOfToday.toISOString();
  const timeMax = options?.timeMax || new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString();

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    maxResults: options?.maxResults || 100,
    singleEvents: true,
    orderBy: 'startTime'
  });

  const rawEvents = res.data.items || [];
  const events: CalendarEvent[] = rawEvents.map((item) => {
    const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
    const start = item.start?.dateTime || item.start?.date || '';
    const end = item.end?.dateTime || item.end?.date || '';

    // Extract Meet link if any
    let meetLink = item.hangoutLink || '';
    if (!meetLink && item.conferenceData?.entryPoints) {
      const videoEntry = item.conferenceData.entryPoints.find(e => e.entryPointType === 'video');
      if (videoEntry?.uri) meetLink = videoEntry.uri;
    }

    return {
      id: item.id || '',
      title: item.summary || '(Sin título)',
      description: item.description || '',
      location: item.location || '',
      start,
      end,
      allDay: isAllDay,
      meetLink,
      htmlLink: item.htmlLink || '',
      status: item.status || 'confirmed',
      attendees: (item.attendees || []).map(a => ({
        email: a.email || '',
        name: a.displayName || undefined,
        responseStatus: a.responseStatus || undefined
      })),
      creator: {
        email: item.creator?.email || undefined,
        displayName: item.creator?.displayName || undefined
      }
    };
  });

  return {
    connected: true,
    email: stored.email,
    name: stored.name,
    connectedAt: stored.connectedAt,
    events
  };
}

export async function createCalendarEvent(eventData: {
  title: string;
  description?: string;
  start: string; // ISO string
  end: string;   // ISO string
  attendees?: string[]; // array of emails
  addMeet?: boolean;
  userEmail?: string;
}) {
  const stored = getStoredTokens(eventData.userEmail);
  if (!stored) throw new Error('Google Calendar no está conectado');

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(stored);

  oauth2Client.on('tokens', (newTokens) => {
    saveTokens(newTokens, stored.email);
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const requestBody: any = {
    summary: eventData.title,
    description: eventData.description,
    start: { dateTime: eventData.start },
    end: { dateTime: eventData.end }
  };

  if (eventData.attendees && eventData.attendees.length > 0) {
    requestBody.attendees = eventData.attendees.map(email => ({ email }));
  }

  if (eventData.addMeet) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `req-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    };
  }

  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody,
    conferenceDataVersion: eventData.addMeet ? 1 : 0
  });

  return res.data;
}

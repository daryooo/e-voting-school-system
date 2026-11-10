import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDirectory = path.resolve(process.env.EBOTO_DATA_DIR || path.join(root, 'data'))
const uploadDirectory = path.join(dataDirectory, 'candidate-photos')
const databasePath = path.join(dataDirectory, 'eboto.sqlite')
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'
const sessionMinutes = 15
const maxBodyBytes = 3 * 1024 * 1024

mkdirSync(uploadDirectory, { recursive: true })
const db = new DatabaseSync(databasePath)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
    login TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY REFERENCES users(id),
    student_number TEXT NOT NULL UNIQUE,
    campus TEXT NOT NULL DEFAULT 'Main Campus',
    college TEXT NOT NULL DEFAULT '',
    program TEXT NOT NULL DEFAULT '',
    year_level INTEGER NOT NULL DEFAULT 1,
    photo_url TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS elections (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    election_type TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'open', 'closed', 'published')),
    results_policy TEXT NOT NULL DEFAULT 'hidden' CHECK (results_policy IN ('hidden', 'turnout_only', 'live')),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    public_results INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    election_id TEXT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    seats INTEGER NOT NULL DEFAULT 1,
    max_votes INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS partylists (
    id TEXT PRIMARY KEY,
    election_id TEXT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#800000',
    UNIQUE (election_id, name)
  );
  CREATE TABLE IF NOT EXISTS candidates (
    id TEXT PRIMARY KEY,
    position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    partylist_id TEXT REFERENCES partylists(id),
    name TEXT NOT NULL,
    college TEXT NOT NULL,
    program TEXT NOT NULL,
    year_level INTEGER NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    achievements TEXT NOT NULL DEFAULT '',
    photo_url TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    deactivation_reason TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS voter_eligibility (
    election_id TEXT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id),
    status TEXT NOT NULL CHECK (status IN ('not_verified', 'pending', 'verified', 'rejected', 'voted')),
    verified_by TEXT REFERENCES users(id),
    verified_at TEXT,
    reject_reason TEXT,
    PRIMARY KEY (election_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS ballots (
    id TEXT PRIMARY KEY,
    election_id TEXT NOT NULL REFERENCES elections(id),
    receipt_code TEXT NOT NULL UNIQUE,
    submitted_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ballot_items (
    id TEXT PRIMARY KEY,
    ballot_id TEXT NOT NULL REFERENCES ballots(id),
    position_id TEXT NOT NULL REFERENCES positions(id),
    candidate_id TEXT REFERENCES candidates(id)
  );
  CREATE TABLE IF NOT EXISTS ballot_seals (
    ballot_id TEXT PRIMARY KEY REFERENCES ballots(id)
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_eligibility_election_status ON voter_eligibility(election_id, status);
  CREATE INDEX IF NOT EXISTS idx_ballots_election ON ballots(election_id);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_ballot_candidate_once
    ON ballot_items(ballot_id, position_id, candidate_id) WHERE candidate_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_ballot_abstain_once
    ON ballot_items(ballot_id, position_id) WHERE candidate_id IS NULL;

  CREATE TRIGGER IF NOT EXISTS ballots_are_immutable_update
  BEFORE UPDATE ON ballots BEGIN SELECT RAISE(ABORT, 'ballots are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS ballots_are_immutable_delete
  BEFORE DELETE ON ballots BEGIN SELECT RAISE(ABORT, 'ballots are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS ballot_items_are_immutable_update
  BEFORE UPDATE ON ballot_items BEGIN SELECT RAISE(ABORT, 'ballot items are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS ballot_items_are_immutable_delete
  BEFORE DELETE ON ballot_items BEGIN SELECT RAISE(ABORT, 'ballot items are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS ballot_items_reject_late_insert
  BEFORE INSERT ON ballot_items
  WHEN EXISTS (SELECT 1 FROM ballot_seals WHERE ballot_id = NEW.ballot_id)
  BEGIN SELECT RAISE(ABORT, 'ballot items are sealed'); END;
  CREATE TRIGGER IF NOT EXISTS ballot_seals_are_immutable_update
  BEFORE UPDATE ON ballot_seals BEGIN SELECT RAISE(ABORT, 'ballot seals are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS ballot_seals_are_immutable_delete
  BEFORE DELETE ON ballot_seals BEGIN SELECT RAISE(ABORT, 'ballot seals are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS audit_logs_are_immutable_update
  BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit logs are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS audit_logs_are_immutable_delete
  BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit logs are immutable'); END;
`)

if (!db.prepare('PRAGMA table_info(candidates)').all().some((column) => column.name === 'deactivation_reason')) {
  db.exec("ALTER TABLE candidates ADD COLUMN deactivation_reason TEXT NOT NULL DEFAULT ''")
}

const now = () => new Date().toISOString()
const id = () => randomBytes(16).toString('hex')
const tokenDigest = (token) => createHash('sha256').update(token).digest('hex')

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function passwordMatches(password, storedHash) {
  const [scheme, salt, hash] = storedHash.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

function createUser(role, login, name, password, student = {}) {
  const userId = id()
  db.prepare('INSERT INTO users (id, role, login, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, role, login, name, hashPassword(password), now())
  if (role === 'student') {
    db.prepare(`INSERT INTO students (id, student_number, college, program, year_level, campus)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(userId, student.studentNumber || login, student.college || 'College of Computer Studies', student.program || 'BS Information Technology', student.yearLevel || 2, student.campus || 'Main Campus')
  }
  return userId
}

function seedDemoData() {
  const hasUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0
  if (hasUsers) return

  if (process.env.NODE_ENV === 'production') {
    const email = process.env.EBOTO_ADMIN_EMAIL
    const password = process.env.EBOTO_ADMIN_PASSWORD
    if (!email || !password) return
    createUser('admin', email.toLowerCase(), 'Election Administrator', password)
    return
  }

  const adminId = createUser('admin', 'admin@ctu.edu.ph', 'Election Administrator', 'CtuAdmin!2026')
  const studentOne = createUser('student', '2026-0001', 'Alyssa Mae Garcia', 'CtuStudent!2026', {
    college: 'College of Computer Studies',
    program: 'BS Information Technology',
    yearLevel: 3,
  })
  const studentTwo = createUser('student', '2026-0002', 'Marco Luis Reyes', 'CtuStudent!2026', {
    college: 'College of Engineering',
    program: 'BS Civil Engineering',
    yearLevel: 2,
  })
  const studentThree = createUser('student', '2026-0003', 'Sofia Marie Dela Cruz', 'CtuStudent!2026', {
    college: 'College of Arts and Sciences',
    program: 'BA Communication',
    yearLevel: 1,
  })
  const startAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const endAt = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString()
  const electionId = id()
  db.prepare(`INSERT INTO elections
    (id, title, description, election_type, academic_year, start_at, end_at, status, results_policy, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'hidden', ?, ?)`)
    .run(electionId, 'Student Government Election', 'Choose the student leaders who will represent our CTU Main Campus community.', 'Student Government', '2026–2027', startAt, endAt, adminId, now())

  const positions = [
    { title: 'President', candidates: [
      { name: 'Isabella Santos', party: 'Bag-ong Sugbo', college: 'College of Arts and Sciences', program: 'BA Political Science', year: 3, bio: 'A student leader who believes every voice deserves a seat at the table.', platform: 'Transparent student services, stronger campus mental-health support, and a more connected student body.' },
      { name: 'Gabriel Mendoza', party: 'Kauswagan', college: 'College of Engineering', program: 'BS Mechanical Engineering', year: 3, bio: 'Committed to practical, student-led change across every college.', platform: 'Reliable student services, accessible consultation hours, and better organization funding.' },
    ] },
    { title: 'Vice President', candidates: [
      { name: 'Mikaela Cruz', party: 'Bag-ong Sugbo', college: 'College of Computer Studies', program: 'BS Information Technology', year: 2, bio: 'Focused on making student government more open and approachable.', platform: 'A clear project tracker and a simpler channel for student concerns.' },
      { name: 'Rafael Lim', party: 'Kauswagan', college: 'College of Business', program: 'BS Management Accounting', year: 3, bio: 'Bringing collaboration and thoughtful planning to campus leadership.', platform: 'More inter-college programs and financial literacy opportunities.' },
    ] },
    { title: 'Senator', candidates: [
      { name: 'Nina Villanueva', party: 'Independent', college: 'College of Computer Studies', program: 'BS Computer Science', year: 2, bio: 'An advocate for digital inclusion and student wellbeing.', platform: 'Accessible student support and practical campus technology.' },
      { name: 'Joshua Bautista', party: 'Independent', college: 'College of Technology', program: 'BS Industrial Technology', year: 3, bio: 'Ready to listen, organize, and help turn student ideas into action.', platform: 'Hands-on leadership workshops and a more responsive student council.' },
    ] },
  ]

  positions.forEach((position, positionIndex) => {
    const positionId = id()
    db.prepare(`INSERT INTO positions (id, election_id, title, seats, max_votes, display_order)
      VALUES (?, ?, ?, 1, 1, ?)`)
      .run(positionId, electionId, position.title, positionIndex)
    position.candidates.forEach((candidate, candidateIndex) => {
      let partylistId = null
      if (candidate.party !== 'Independent') {
        const existing = db.prepare('SELECT id FROM partylists WHERE election_id = ? AND name = ?').get(electionId, candidate.party)
        partylistId = existing?.id || id()
        if (!existing) db.prepare('INSERT INTO partylists (id, election_id, name, color) VALUES (?, ?, ?, ?)')
          .run(partylistId, electionId, candidate.party, candidate.party === 'Kauswagan' ? '#3d6c53' : '#800000')
      }
      db.prepare(`INSERT INTO candidates
        (id, position_id, partylist_id, name, college, program, year_level, bio, platform, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id(), positionId, partylistId, candidate.name, candidate.college, candidate.program, candidate.year, candidate.bio, candidate.platform, candidateIndex)
    })
  })

  for (const [studentId, status] of [[studentOne, 'verified'], [studentTwo, 'pending'], [studentThree, 'not_verified']]) {
    db.prepare('INSERT INTO voter_eligibility (election_id, student_id, status) VALUES (?, ?, ?)')
      .run(electionId, studentId, status)
  }
}

seedDemoData()

const statements = {
  userByLogin: db.prepare('SELECT * FROM users WHERE login = ? AND active = 1'),
  userById: db.prepare('SELECT id, role, login, name FROM users WHERE id = ? AND active = 1'),
  session: db.prepare(`SELECT s.token_hash, s.expires_at, u.id, u.role, u.login, u.name
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.active = 1`),
}

function audit(actorId, action, entityType, entityId, metadata = {}) {
  db.prepare(`INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(actorId, action, entityType, entityId, JSON.stringify(metadata), now())
}

function setHeaders(response, contentType = 'application/json; charset=utf-8') {
  response.setHeader('Content-Type', contentType)
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

function json(response, status, payload, headers = {}) {
  setHeaders(response)
  response.writeHead(status, headers)
  response.end(JSON.stringify(payload))
}

function parseCookies(request) {
  const cookie = request.headers.cookie || ''
  return Object.fromEntries(cookie.split(';').map((part) => {
    const [key, ...value] = part.trim().split('=')
    return [key, value.join('=')]
  }).filter(([key]) => key))
}

function createSession(response, userId) {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = tokenDigest(token)
  const expiresAt = new Date(Date.now() + sessionMinutes * 60 * 1000).toISOString()
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, expiresAt)
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `eboto_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionMinutes * 60}${secure}`)
}

function destroySession(request, response) {
  const token = parseCookies(request).eboto_session
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenDigest(token))
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `eboto_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`)
}

function sessionUser(request, requiredRole, response) {
  const token = parseCookies(request).eboto_session
  if (!token) return null
  const digest = tokenDigest(token)
  const session = statements.session.get(digest)
  if (!session) return null
  if (Date.parse(session.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest)
    return null
  }
  if (requiredRole && session.role !== requiredRole) return null
  const expiresAt = new Date(Date.now() + sessionMinutes * 60 * 1000).toISOString()
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(expiresAt, digest)
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `eboto_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionMinutes * 60}${secure}`)
  return { id: session.id, role: session.role, login: session.login, name: session.name }
}

async function readJson(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > maxBodyBytes) {
      const error = new Error('The request is too large.')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  if (!total) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('The request body must be valid JSON.')
    error.status = 400
    throw error
  }
}

function requireUser(request, response, role) {
  const user = sessionUser(request, role, response)
  if (!user) {
    json(response, 401, { error: 'Your session has expired. Please sign in again.' })
    return null
  }
  return user
}

function requireMutationHeader(request, response) {
  if (request.headers['x-eboto-request'] !== '1') {
    json(response, 403, { error: 'This request could not be verified. Refresh the page and try again.' })
    return false
  }
  return true
}

function electionState(election) {
  if (election.status === 'draft' || election.status === 'closed' || election.status === 'published') return election.status
  const current = Date.now()
  if (current < Date.parse(election.start_at)) return 'scheduled'
  if (current > Date.parse(election.end_at)) return 'closed'
  return 'open'
}

function getElection(electionId) {
  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(electionId)
  if (!election) return null
  const result = { ...election, status: electionState(election) }
  result.positions = db.prepare(`SELECT id, title, seats, max_votes AS maxVotes, display_order AS displayOrder
    FROM positions WHERE election_id = ? ORDER BY display_order, title`).all(electionId).map((position) => ({
    ...position,
    candidates: db.prepare(`SELECT c.id, c.name, c.college, c.program, c.year_level AS yearLevel, c.bio, c.platform,
      c.achievements, c.photo_url AS photoUrl, c.active, c.deactivation_reason AS deactivationReason, c.display_order AS displayOrder,
      p.name AS partylist, p.color AS partyColor
      FROM candidates c LEFT JOIN partylists p ON p.id = c.partylist_id
      WHERE c.position_id = ? ORDER BY c.display_order, c.name`).all(position.id),
  }))
  return result
}

function voterStatus(electionId, studentId) {
  return db.prepare('SELECT status, reject_reason AS rejectReason FROM voter_eligibility WHERE election_id = ? AND student_id = ?')
    .get(electionId, studentId)
}

function storedCandidatePhoto(photoUrl) {
  const match = String(photoUrl || '').match(/^\/uploads\/candidates\/([a-f0-9]{32}\.webp)$/)
  return Boolean(match && existsSync(path.join(uploadDirectory, match[1])))
}

function electionForStudent(electionId, userId) {
  const election = getElection(electionId)
  if (!election) return null
  const eligibility = voterStatus(electionId, userId)
  return { ...election, eligibility: eligibility || null }
}

function electionResults(electionId) {
  const election = getElection(electionId)
  if (!election) return null
  const totalBallots = db.prepare('SELECT COUNT(*) AS count FROM ballots WHERE election_id = ?').get(electionId).count
  const eligibleCount = db.prepare('SELECT COUNT(*) AS count FROM voter_eligibility WHERE election_id = ?').get(electionId).count
  const positions = election.positions.map((position) => {
    const abstainCount = db.prepare(`SELECT COUNT(*) AS count FROM ballot_items bi
      JOIN ballots b ON b.id = bi.ballot_id WHERE b.election_id = ? AND bi.position_id = ? AND bi.candidate_id IS NULL`)
      .get(electionId, position.id).count
    const candidates = position.candidates.filter((candidate) => candidate.active).map((candidate) => {
      const votes = db.prepare(`SELECT COUNT(*) AS count FROM ballot_items bi
        JOIN ballots b ON b.id = bi.ballot_id
        WHERE b.election_id = ? AND bi.position_id = ? AND bi.candidate_id = ?`)
        .get(electionId, position.id, candidate.id).count
      return { ...candidate, votes, percentage: totalBallots ? Math.round((votes / totalBallots) * 100) : 0 }
    }).sort((left, right) => right.votes - left.votes || left.name.localeCompare(right.name))
    const topCount = candidates[0]?.votes || 0
    return {
      ...position,
      abstainCount,
      candidates,
      tie: topCount > 0 && candidates.filter((candidate) => candidate.votes === topCount).length > 1,
      winnerId: topCount > 0 && candidates.filter((candidate) => candidate.votes === topCount).length === 1 ? candidates[0].id : null,
    }
  })
  const turnoutByProgram = db.prepare(`SELECT s.college, s.program, COUNT(*) AS eligible,
    SUM(CASE WHEN ve.status = 'voted' THEN 1 ELSE 0 END) AS voted
    FROM voter_eligibility ve JOIN students s ON s.id = ve.student_id
    WHERE ve.election_id = ? GROUP BY s.college, s.program ORDER BY s.college, s.program`).all(electionId)
  return {
    election: { id: election.id, title: election.title, academicYear: election.academic_year, status: election.status },
    totalBallots,
    eligibleCount,
    turnout: eligibleCount ? Math.round((totalBallots / eligibleCount) * 100) : 0,
    positions,
    turnoutByProgram,
  }
}

function parseCsvRow(line) {
  const values = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      values.push(value.trim())
      value = ''
    } else {
      value += character
    }
  }
  values.push(value.trim())
  return values
}

function parseVoterCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) throw Object.assign(new Error('Add a header row and at least one student ID.'), { status: 400 })
  const headers = parseCsvRow(lines[0]).map((header) => header.toLowerCase().replace(/[\s-]+/g, '_'))
  const idIndex = headers.findIndex((header) => ['student_id', 'student_number', 'studentid'].includes(header))
  if (idIndex < 0) throw Object.assign(new Error('The CSV needs a student_id or student_number column.'), { status: 400 })
  return [...new Set(lines.slice(1).map((line) => parseCsvRow(line)[idIndex]).filter(Boolean))]
}

const failedLogins = new Map()
const registrationsByAddress = new Map()
const loginWindowMs = 15 * 60 * 1000
const maxLoginFailures = 5
const maxRegistrationsPerWindow = 5

async function handleApi(request, response, url) {
  const method = request.method || 'GET'
  const pathname = url.pathname
  const segments = pathname.split('/').filter(Boolean)

  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJson(request)
    const role = body.role === 'admin' ? 'admin' : body.role === 'student' ? 'student' : null
    const login = String(body.login || '').trim().toLowerCase()
    const password = String(body.password || '')
    const remote = String(request.socket.remoteAddress || 'local')
    const key = `${remote}:${role || 'unknown'}:${login}`
    const current = failedLogins.get(key)
    if (current && current.until > Date.now() && current.count >= maxLoginFailures) {
      json(response, 429, { error: 'Too many unsuccessful attempts. Please wait 15 minutes before trying again.' })
      return
    }
    const user = role ? statements.userByLogin.get(login) : null
    if (!user || user.role !== role || !passwordMatches(password, user.password_hash)) {
      const next = current?.until > Date.now() ? current : { count: 0, until: Date.now() + loginWindowMs }
      next.count += 1
      failedLogins.set(key, next)
      json(response, next.count >= maxLoginFailures ? 429 : 401, {
        error: next.count >= maxLoginFailures ? 'Too many unsuccessful attempts. Please wait 15 minutes before trying again.' : 'The ID, email, password, or account type is incorrect.',
      })
      return
    }
    failedLogins.delete(key)
    createSession(response, user.id)
    json(response, 200, { user: { id: user.id, role: user.role, login: user.login, name: user.name } })
    return
  }

  if (method === 'POST' && pathname === '/api/auth/register') {
    const remote = String(request.socket.remoteAddress || 'local')
    const current = registrationsByAddress.get(remote)
    if (current && current.until > Date.now() && current.count >= maxRegistrationsPerWindow) {
      json(response, 429, { error: 'Too many accounts were created from this connection. Please try again in 15 minutes.' })
      return
    }

    const body = await readJson(request)
    const studentNumber = String(body.studentNumber || '').trim().toUpperCase()
    const name = String(body.name || '').trim().replace(/\s+/g, ' ')
    const college = String(body.college || '').trim()
    const program = String(body.program || '').trim()
    const yearLevel = Number(body.yearLevel)
    const password = String(body.password || '')
    if (!/^[A-Z0-9-]{3,32}$/.test(studentNumber)) {
      json(response, 400, { error: 'Enter a valid student ID using 3–32 letters, numbers, or hyphens.' })
      return
    }
    if (name.length < 2 || name.length > 100 || !college || college.length > 120 || !program || program.length > 120) {
      json(response, 400, { error: 'Enter your full name, college, and program.' })
      return
    }
    if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 6) {
      json(response, 400, { error: 'Choose a valid year level.' })
      return
    }
    if (password.length < 10 || password.length > 128) {
      json(response, 400, { error: 'Choose a password between 10 and 128 characters.' })
      return
    }

    const next = current?.until > Date.now() ? current : { count: 0, until: Date.now() + loginWindowMs }
    next.count += 1
    registrationsByAddress.set(remote, next)
    try {
      db.exec('BEGIN IMMEDIATE')
      const userId = createUser('student', studentNumber.toLowerCase(), name, password, { studentNumber, college, program, yearLevel })
      db.exec('COMMIT')
      createSession(response, userId)
      json(response, 201, { user: statements.userById.get(userId) })
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK')
      if (String(error.message).includes('UNIQUE constraint')) {
        json(response, 409, { error: 'An account already exists for that student ID. Sign in or contact the election administrator.' })
        return
      }
      throw error
    }
    return
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    if (!requireMutationHeader(request, response)) return
    destroySession(request, response)
    json(response, 200, { ok: true })
    return
  }

  if (method === 'GET' && pathname === '/api/me') {
    const user = requireUser(request, response)
    if (!user) return
    const student = user.role === 'student'
      ? db.prepare('SELECT student_number AS studentNumber, campus, college, program, year_level AS yearLevel FROM students WHERE id = ?').get(user.id)
      : null
    json(response, 200, { user, student })
    return
  }

  if (pathname.startsWith('/api/') && method !== 'GET' && !requireMutationHeader(request, response)) return

  if (method === 'GET' && pathname === '/api/elections') {
    const user = requireUser(request, response)
    if (!user) return
    const rows = user.role === 'admin'
      ? db.prepare('SELECT * FROM elections ORDER BY start_at DESC').all()
      : db.prepare(`SELECT e.* FROM elections e JOIN voter_eligibility ve ON ve.election_id = e.id
        WHERE ve.student_id = ? ORDER BY e.start_at DESC`).all(user.id)
    json(response, 200, {
      elections: rows.map((row) => {
        const election = getElection(row.id)
        const eligibility = user.role === 'student' ? voterStatus(row.id, user.id) : null
        const counts = db.prepare(`SELECT COUNT(*) AS eligible,
          SUM(CASE WHEN status = 'verified' OR status = 'voted' THEN 1 ELSE 0 END) AS verified,
          SUM(CASE WHEN status = 'voted' THEN 1 ELSE 0 END) AS voted
          FROM voter_eligibility WHERE election_id = ?`).get(row.id)
        return {
          ...election,
          eligibility: eligibility || null,
          eligibleCount: counts.eligible || 0,
          verifiedCount: counts.verified || 0,
          votesCast: counts.voted || 0,
        }
      }),
    })
    return
  }

  if (method === 'GET' && pathname === '/api/admin/overview') {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const elections = db.prepare('SELECT * FROM elections ORDER BY start_at DESC').all()
    const active = elections.filter((election) => electionState(election) === 'open')
    const upcoming = elections.filter((election) => electionState(election) === 'scheduled')
    const selectedElection = active[0] || elections[0] || null
    const voters = selectedElection
      ? db.prepare(`SELECT COUNT(*) AS total,
          SUM(CASE WHEN status IN ('verified', 'voted') THEN 1 ELSE 0 END) AS verified
          FROM voter_eligibility WHERE election_id = ?`).get(selectedElection.id)
      : { total: 0, verified: 0 }
    const votesCast = selectedElection
      ? db.prepare('SELECT COUNT(*) AS count FROM ballots WHERE election_id = ?').get(selectedElection.id).count
      : 0
    const turnout = selectedElection
      ? db.prepare(`SELECT strftime('%H', submitted_at, '+8 hours') AS hour, COUNT(*) AS votes
        FROM ballots WHERE election_id = ? GROUP BY strftime('%H', submitted_at, '+8 hours') ORDER BY MIN(submitted_at)`)
        .all(selectedElection.id)
      : []
    const recent = db.prepare(`SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId,
      a.metadata, a.created_at AS createdAt, u.name AS actor
      FROM audit_logs a JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 5`).all()
    json(response, 200, {
      summary: {
        activeElections: active.length,
        upcomingElections: upcoming.length,
        totalVoters: voters.total || 0,
        verifiedVoters: voters.verified || 0,
        votesCast,
        turnout: voters.total ? Math.round((votesCast / voters.total) * 100) : 0,
      },
      election: selectedElection ? getElection(selectedElection.id) : null,
      turnout,
      recent: recent.map((record) => ({ ...record, metadata: JSON.parse(record.metadata) })),
    })
    return
  }

  if (method === 'POST' && pathname === '/api/elections') {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const body = await readJson(request)
    const title = String(body.title || '').trim()
    const positions = Array.isArray(body.positions) ? body.positions : []
    const startAt = Date.parse(body.startAt)
    const endAt = Date.parse(body.endAt)
    if (!title || !body.academicYear || !body.electionType) {
      json(response, 400, { error: 'Add an election title, type, and academic year.' })
      return
    }
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
      json(response, 400, { error: 'The end date must be after the start date.' })
      return
    }
    if (positions.length === 0 || positions.some((position) => !String(position.title || '').trim())) {
      json(response, 400, { error: 'Add at least one position and give every position a title.' })
      return
    }
    if (positions.some((position) => !Array.isArray(position.candidates) || position.candidates.length === 0)) {
      json(response, 400, { error: 'Every position needs at least one candidate.' })
      return
    }
    if (positions.some((position) => position.candidates.some((candidate) =>
      !candidate.name || !candidate.college || !candidate.program || !Number(candidate.yearLevel) ||
      Number(candidate.yearLevel) > 6 || !storedCandidatePhoto(candidate.photoUrl)))) {
      json(response, 400, { error: 'Each candidate needs a name, college, program, year level, and photo.' })
      return
    }
    const roster = body.voterCsv ? parseVoterCsv(String(body.voterCsv)) : []
    const rosterStudents = roster.map((studentNumber) => ({
      studentNumber,
      student: db.prepare('SELECT id FROM students WHERE student_number = ?').get(studentNumber),
    }))
    const imported = rosterStudents.filter(({ student }) => student).length
    const unknown = rosterStudents.filter(({ student }) => !student).map(({ studentNumber }) => studentNumber)
    if (body.publish && imported === 0) {
      json(response, 409, { error: 'Import at least one eligible student with an existing account before publishing.' })
      return
    }

    const electionId = id()
    const status = body.publish ? 'scheduled' : 'draft'
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`INSERT INTO elections
        (id, title, description, election_type, academic_year, start_at, end_at, status, results_policy, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(electionId, title, String(body.description || '').trim(), String(body.electionType), String(body.academicYear), new Date(startAt).toISOString(), new Date(endAt).toISOString(), status, ['hidden', 'turnout_only', 'live'].includes(body.resultsPolicy) ? body.resultsPolicy : 'hidden', user.id, now())
      positions.forEach((position, positionIndex) => {
        const positionId = id()
        const seats = Math.max(1, Math.min(20, Number.parseInt(position.seats, 10) || 1))
        const maxVotes = Math.max(1, Math.min(20, Number.parseInt(position.maxVotes, 10) || seats))
        db.prepare(`INSERT INTO positions (id, election_id, title, seats, max_votes, display_order)
          VALUES (?, ?, ?, ?, ?, ?)`).run(positionId, electionId, String(position.title).trim(), seats, maxVotes, positionIndex)
        position.candidates.forEach((candidate, candidateIndex) => {
          let partylistId = null
          const party = String(candidate.partylist || '').trim()
          if (party) {
            const existing = db.prepare('SELECT id FROM partylists WHERE election_id = ? AND name = ?').get(electionId, party)
            partylistId = existing?.id || id()
            if (!existing) db.prepare('INSERT INTO partylists (id, election_id, name, color) VALUES (?, ?, ?, ?)').run(partylistId, electionId, party, '#800000')
          }
          db.prepare(`INSERT INTO candidates
            (id, position_id, partylist_id, name, college, program, year_level, bio, platform, achievements, photo_url, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id(), positionId, partylistId, String(candidate.name).trim(), String(candidate.college).trim(), String(candidate.program).trim(), Math.max(1, Number.parseInt(candidate.yearLevel, 10) || 1), String(candidate.bio || '').slice(0, 300), String(candidate.platform || '').slice(0, 1000), String(candidate.achievements || '').slice(0, 1000), String(candidate.photoUrl || '') || null, candidateIndex)
        })
      })
      for (const { student } of rosterStudents) {
        if (student) db.prepare(`INSERT OR IGNORE INTO voter_eligibility (election_id, student_id, status)
          VALUES (?, ?, 'not_verified')`).run(electionId, student.id)
      }
      audit(user.id, body.publish ? 'election.publish' : 'election.create', 'election', electionId, { title, votersImported: imported, unknownCount: unknown.length })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    json(response, 201, { election: getElection(electionId), voterImport: { imported, unknown } })
    return
  }

  const electionUpdateMatch = pathname.match(/^\/api\/elections\/([^/]+)$/)
  if (method === 'PUT' && electionUpdateMatch) {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const election = getElection(electionUpdateMatch[1])
    if (!election) {
      json(response, 404, { error: 'Election not found.' })
      return
    }
    if (election.status !== 'draft') {
      json(response, 409, { error: 'Only draft elections can be edited.' })
      return
    }
    const body = await readJson(request)
    const positions = Array.isArray(body.positions) ? body.positions : []
    const startAt = Date.parse(body.startAt)
    const endAt = Date.parse(body.endAt)
    if (!String(body.title || '').trim() || !body.academicYear || !body.electionType ||
        !Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
      json(response, 400, { error: 'Add a title, type, academic year, and a valid voting schedule.' })
      return
    }
    if (!positions.length || positions.some((position) => !String(position.title || '').trim() ||
      !Array.isArray(position.candidates) || !position.candidates.length ||
      position.candidates.some((candidate) => !candidate.name || !candidate.college || !candidate.program ||
        !Number(candidate.yearLevel) || Number(candidate.yearLevel) > 6 || !storedCandidatePhoto(candidate.photoUrl) ||
        (candidate.active === false && !candidate.deactivationReason)))) {
      json(response, 400, { error: 'Every position needs a candidate with a name, photo, college, program, year level, and a reason if deactivated.' })
      return
    }
    const rosterCount = db.prepare('SELECT COUNT(*) AS count FROM voter_eligibility WHERE election_id = ?').get(election.id).count
    if (body.publish && !rosterCount) {
      json(response, 409, { error: 'Import at least one eligible student before publishing.' })
      return
    }
    if (body.publish && positions.some((position) => !position.candidates.some((candidate) => candidate.active !== false))) {
      json(response, 409, { error: 'Keep at least one active candidate in every position before publishing.' })
      return
    }
    const previousCandidates = new Map(election.positions.flatMap((position) => position.candidates.map((candidate) => [candidate.id, candidate])))
    const previousCandidateIds = new Set(previousCandidates.keys())
    const updatedCandidateIds = new Set(positions.flatMap((position) => position.candidates.map((candidate) => candidate.id).filter(Boolean)))
    const removedCandidateCount = [...previousCandidateIds].filter((candidateId) => !updatedCandidateIds.has(candidateId)).length
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`UPDATE elections SET title = ?, description = ?, election_type = ?, academic_year = ?,
        start_at = ?, end_at = ?, results_policy = ?, status = ? WHERE id = ?`)
        .run(String(body.title).trim(), String(body.description || '').trim(), String(body.electionType), String(body.academicYear), new Date(startAt).toISOString(), new Date(endAt).toISOString(), ['hidden', 'turnout_only', 'live'].includes(body.resultsPolicy) ? body.resultsPolicy : 'hidden', body.publish ? 'scheduled' : 'draft', election.id)
      db.prepare('DELETE FROM positions WHERE election_id = ?').run(election.id)
      db.prepare('DELETE FROM partylists WHERE election_id = ?').run(election.id)
      positions.forEach((position, positionIndex) => {
        const positionId = id()
        const seats = Math.max(1, Math.min(20, Number.parseInt(position.seats, 10) || 1))
        const maxVotes = Math.max(1, Math.min(20, Number.parseInt(position.maxVotes, 10) || seats))
        db.prepare(`INSERT INTO positions (id, election_id, title, seats, max_votes, display_order)
          VALUES (?, ?, ?, ?, ?, ?)`).run(positionId, election.id, String(position.title).trim(), seats, maxVotes, positionIndex)
        position.candidates.forEach((candidate, candidateIndex) => {
          let partylistId = null
          const party = String(candidate.partylist || '').trim()
          if (party) {
            const existing = db.prepare('SELECT id FROM partylists WHERE election_id = ? AND name = ?').get(election.id, party)
            partylistId = existing?.id || id()
            if (!existing) db.prepare('INSERT INTO partylists (id, election_id, name, color) VALUES (?, ?, ?, ?)').run(partylistId, election.id, party, '#800000')
          }
          db.prepare(`INSERT INTO candidates
            (id, position_id, partylist_id, name, college, program, year_level, bio, platform, achievements, photo_url, active, deactivation_reason, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id(), positionId, partylistId, String(candidate.name).trim(), String(candidate.college).trim(), String(candidate.program).trim(), Math.max(1, Number.parseInt(candidate.yearLevel, 10) || 1), String(candidate.bio || '').slice(0, 300), String(candidate.platform || '').slice(0, 1000), String(candidate.achievements || '').slice(0, 1000), String(candidate.photoUrl || '') || null, candidate.active === false ? 0 : 1, candidate.active === false ? String(candidate.deactivationReason).trim() : '', candidateIndex)
          if (candidate.id && previousCandidates.get(candidate.id)?.active && candidate.active === false) {
            audit(user.id, 'candidate.deactivate', 'election', election.id, { candidate: candidate.name, reason: String(candidate.deactivationReason).trim() })
          }
        })
      })
      audit(user.id, body.publish ? 'election.publish' : 'election.update', 'election', election.id, { title: String(body.title).trim(), removedCandidates: removedCandidateCount })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    json(response, 200, { election: getElection(election.id) })
    return
  }

  const photoMatch = pathname === '/api/uploads/candidate-photo'
  if (method === 'POST' && photoMatch) {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const body = await readJson(request)
    const match = String(body.dataUrl || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/)
    if (!match) {
      json(response, 400, { error: 'Choose a JPG, PNG, or WebP image.' })
      return
    }
    const source = Buffer.from(match[2], 'base64')
    if (source.length === 0 || source.length > 2 * 1024 * 1024) {
      json(response, 413, { error: 'Candidate images must be no larger than 2 MB.' })
      return
    }
    try {
      const image = sharp(source, { failOn: 'error', limitInputPixels: 16_000_000 })
      const metadata = await image.metadata()
      if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
        json(response, 415, { error: 'Choose a valid JPG, PNG, or WebP image.' })
        return
      }
      const fileName = `${id()}.webp`
      await image.rotate().resize(480, 480, { fit: 'cover', position: 'centre' }).webp({ quality: 84 }).toFile(path.join(uploadDirectory, fileName))
      audit(user.id, 'candidate.photo.upload', 'candidate-photo', fileName, { format: metadata.format, bytes: source.length })
      json(response, 201, { photoUrl: `/uploads/candidates/${fileName}` })
    } catch {
      json(response, 415, { error: 'That image could not be opened. Please choose another JPG, PNG, or WebP file.' })
    }
    return
  }

  const voterImportMatch = pathname.match(/^\/api\/elections\/([^/]+)\/voters\/import$/)
  if (method === 'POST' && voterImportMatch) {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const election = getElection(voterImportMatch[1])
    if (!election) {
      json(response, 404, { error: 'Election not found.' })
      return
    }
    if (election.status !== 'draft') {
      json(response, 409, { error: 'The voter list is locked after an election is published.' })
      return
    }
    const body = await readJson(request)
    const studentNumbers = parseVoterCsv(String(body.csv || ''))
    let imported = 0
    const unknown = []
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const studentNumber of studentNumbers) {
        const student = db.prepare('SELECT id FROM students WHERE student_number = ?').get(studentNumber)
        if (!student) {
          unknown.push(studentNumber)
          continue
        }
        const result = db.prepare(`INSERT OR IGNORE INTO voter_eligibility (election_id, student_id, status)
          VALUES (?, ?, 'not_verified')`).run(election.id, student.id)
        imported += Number(result.changes)
      }
      audit(user.id, 'voters.import', 'election', election.id, { imported, unknownCount: unknown.length })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    json(response, 200, { imported, unknown })
    return
  }

  if (method === 'POST' && pathname === '/api/student/verification-request') {
    const user = requireUser(request, response, 'student')
    if (!user) return
    const body = await readJson(request)
    const election = getElection(String(body.electionId || ''))
    if (!election || !['scheduled', 'open'].includes(election.status)) {
      json(response, 404, { error: 'This election is not accepting verification requests.' })
      return
    }
    const eligibility = voterStatus(election.id, user.id)
    if (['verified', 'voted'].includes(eligibility?.status)) {
      json(response, 409, { error: 'Your eligibility has already been confirmed.' })
      return
    }
    if (eligibility?.status === 'pending') {
      json(response, 200, { status: 'pending' })
      return
    }
    db.prepare(`INSERT INTO voter_eligibility (election_id, student_id, status)
      VALUES (?, ?, 'pending')
      ON CONFLICT(election_id, student_id) DO UPDATE SET status = 'pending', reject_reason = NULL`)
      .run(election.id, user.id)
    audit(user.id, 'verification.request', 'election', election.id, {})
    json(response, 200, { status: 'pending' })
    return
  }

  if (method === 'GET' && pathname === '/api/admin/verification-queue') {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const electionId = url.searchParams.get('electionId')
    const rows = electionId
      ? db.prepare(`SELECT ve.election_id AS electionId, ve.status, ve.reject_reason AS rejectReason,
          s.student_number AS studentNumber, s.college, s.program, s.year_level AS yearLevel, s.photo_url AS photoUrl,
          u.name, e.title AS electionTitle
          FROM voter_eligibility ve JOIN students s ON s.id = ve.student_id JOIN users u ON u.id = s.id
          JOIN elections e ON e.id = ve.election_id WHERE ve.election_id = ?
          ORDER BY CASE ve.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END, u.name`).all(electionId)
      : []
    json(response, 200, { voters: rows })
    return
  }

  const verifyMatch = pathname.match(/^\/api\/admin\/elections\/([^/]+)\/voters\/([^/]+)\/(verify|reject)$/)
  if (method === 'POST' && verifyMatch) {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const election = getElection(verifyMatch[1])
    const studentNumber = decodeURIComponent(verifyMatch[2])
    const action = verifyMatch[3]
    const student = db.prepare('SELECT id FROM students WHERE student_number = ?').get(studentNumber)
    const eligibility = student && election ? voterStatus(election.id, student.id) : null
    if (!eligibility) {
      json(response, 404, { error: 'Eligible student not found for this election.' })
      return
    }
    if (eligibility.status === 'voted') {
      json(response, 409, { error: 'A student who has already voted cannot be re-verified.' })
      return
    }
    const body = await readJson(request)
    const reason = String(body.reason || '').trim()
    if (action === 'reject' && !reason) {
      json(response, 400, { error: 'Add a reason before rejecting a verification request.' })
      return
    }
    const status = action === 'verify' ? 'verified' : 'rejected'
    db.prepare(`UPDATE voter_eligibility SET status = ?, verified_by = ?, verified_at = ?, reject_reason = ?
      WHERE election_id = ? AND student_id = ?`)
      .run(status, action === 'verify' ? user.id : null, action === 'verify' ? now() : null, action === 'reject' ? reason : null, election.id, student.id)
    audit(user.id, action === 'verify' ? 'voter.verify' : 'voter.reject', 'election', election.id, { studentNumber, reason: action === 'reject' ? reason : '' })
    json(response, 200, { status })
    return
  }

  const duplicateMatch = pathname.match(/^\/api\/elections\/([^/]+)\/duplicate$/)
  if (method === 'POST' && duplicateMatch) {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const source = getElection(duplicateMatch[1])
    if (!source) {
      json(response, 404, { error: 'Election not found.' })
      return
    }
    const newId = id()
    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const endAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`INSERT INTO elections
        (id, title, description, election_type, academic_year, start_at, end_at, status, results_policy, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`)
        .run(newId, `${source.title} (copy)`, source.description, source.election_type, source.academic_year, startAt, endAt, source.results_policy, user.id, now())
      for (const position of source.positions) {
        const newPositionId = id()
        db.prepare(`INSERT INTO positions (id, election_id, title, seats, max_votes, display_order)
          VALUES (?, ?, ?, ?, ?, ?)`).run(newPositionId, newId, position.title, position.seats, position.maxVotes, position.displayOrder)
        for (const candidate of position.candidates) {
          let partylistId = null
          if (candidate.partylist) {
            partylistId = id()
            db.prepare('INSERT INTO partylists (id, election_id, name, color) VALUES (?, ?, ?, ?)')
              .run(partylistId, newId, candidate.partylist, candidate.partyColor || '#800000')
          }
          db.prepare(`INSERT INTO candidates
            (id, position_id, partylist_id, name, college, program, year_level, bio, platform, achievements, photo_url, active, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id(), newPositionId, partylistId, candidate.name, candidate.college, candidate.program, candidate.yearLevel, candidate.bio, candidate.platform, candidate.achievements, candidate.photoUrl, candidate.active, candidate.displayOrder)
        }
      }
      audit(user.id, 'election.duplicate', 'election', newId, { sourceElectionId: source.id })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    json(response, 201, { election: getElection(newId) })
    return
  }

  const electionActionMatch = pathname.match(/^\/api\/elections\/([^/]+)\/(publish|close|extend|publish-results)$/)
  if (method === 'POST' && electionActionMatch) {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const election = getElection(electionActionMatch[1])
    if (!election) {
      json(response, 404, { error: 'Election not found.' })
      return
    }
    const action = electionActionMatch[2]
    const body = await readJson(request)
    if (action === 'publish') {
      if (election.status !== 'draft' || !election.positions.length || election.positions.some((position) => !position.candidates.some((candidate) => candidate.active))) {
        json(response, 409, { error: 'Add at least one active candidate to every position before publishing.' })
        return
      }
      const voters = db.prepare('SELECT COUNT(*) AS count FROM voter_eligibility WHERE election_id = ?').get(election.id).count
      if (!voters) {
        json(response, 409, { error: 'Import at least one eligible student before publishing.' })
        return
      }
      db.prepare(`UPDATE elections SET status = 'scheduled' WHERE id = ?`).run(election.id)
      audit(user.id, 'election.publish', 'election', election.id, { title: election.title })
    } else if (action === 'close') {
      const reason = String(body.reason || '').trim()
      if (!reason) {
        json(response, 400, { error: 'Add a reason to close the election.' })
        return
      }
      if (!['open', 'scheduled'].includes(election.status)) {
        json(response, 409, { error: 'Only an open or scheduled election can be closed.' })
        return
      }
      db.prepare(`UPDATE elections SET status = 'closed' WHERE id = ?`).run(election.id)
      audit(user.id, 'election.close', 'election', election.id, { reason })
    } else if (action === 'extend') {
      const reason = String(body.reason || '').trim()
      const endAt = Date.parse(body.endAt)
      if (!reason || !Number.isFinite(endAt) || endAt <= Date.parse(election.end_at)) {
        json(response, 400, { error: 'Provide a reason and a new end time later than the current end.' })
        return
      }
      if (!['open', 'scheduled'].includes(election.status)) {
        json(response, 409, { error: 'Only an open or scheduled election can be extended.' })
        return
      }
      db.prepare('UPDATE elections SET end_at = ?, status = ? WHERE id = ?')
        .run(new Date(endAt).toISOString(), endAt > Date.now() ? 'scheduled' : 'closed', election.id)
      audit(user.id, 'election.extend', 'election', election.id, { reason, newEndAt: new Date(endAt).toISOString() })
    } else {
      if (election.status !== 'closed') {
        json(response, 409, { error: 'Close the election before publishing results.' })
        return
      }
      db.prepare(`UPDATE elections SET status = 'published', public_results = ? WHERE id = ?`)
        .run(body.publicResults ? 1 : 0, election.id)
      audit(user.id, 'results.publish', 'election', election.id, { publicResults: Boolean(body.publicResults) })
    }
    json(response, 200, { election: getElection(election.id) })
    return
  }

  const candidateDeactivateMatch = pathname.match(/^\/api\/candidates\/([^/]+)\/deactivate$/)
  if (method === 'POST' && candidateDeactivateMatch) {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const candidate = db.prepare(`SELECT c.id, p.election_id AS electionId FROM candidates c
      JOIN positions p ON p.id = c.position_id WHERE c.id = ?`).get(candidateDeactivateMatch[1])
    const election = candidate && getElection(candidate.electionId)
    if (!candidate || !election) {
      json(response, 404, { error: 'Candidate not found.' })
      return
    }
    if (election.status !== 'draft') {
      json(response, 409, { error: 'Candidates are locked once the election is published.' })
      return
    }
    const body = await readJson(request)
    const reason = String(body.reason || '').trim()
    if (!reason) {
      json(response, 400, { error: 'Add a reason before deactivating a candidate.' })
      return
    }
    db.prepare('UPDATE candidates SET active = 0 WHERE id = ?').run(candidate.id)
    audit(user.id, 'candidate.deactivate', 'candidate', candidate.id, { reason })
    json(response, 200, { ok: true })
    return
  }

  if (method === 'GET' && pathname === '/api/student/elections') {
    const user = requireUser(request, response, 'student')
    if (!user) return
    const rows = db.prepare(`SELECT e.id FROM elections e
      WHERE e.status != 'draft' ORDER BY e.start_at DESC`).all()
    json(response, 200, { elections: rows.map(({ id: electionId }) => electionForStudent(electionId, user.id)) })
    return
  }

  const ballotMatch = pathname.match(/^\/api\/elections\/([^/]+)\/ballot$/)
  if (method === 'GET' && ballotMatch) {
    const user = requireUser(request, response, 'student')
    if (!user) return
    const election = electionForStudent(ballotMatch[1], user.id)
    if (!election) {
      json(response, 404, { error: 'Election not found.' })
      return
    }
    if (election.status !== 'open' || election.eligibility?.status !== 'verified') {
      json(response, 403, { error: 'The ballot is available only while the election is open and your eligibility is verified.' })
      return
    }
    json(response, 200, { election })
    return
  }

  if (method === 'POST' && ballotMatch) {
    const user = requireUser(request, response, 'student')
    if (!user) return
    const body = await readJson(request)
    const election = getElection(ballotMatch[1])
    const eligibility = election && voterStatus(election.id, user.id)
    if (!election || !eligibility) {
      json(response, 404, { error: 'Election or eligibility record not found.' })
      return
    }
    if (election.status !== 'open' || eligibility.status !== 'verified') {
      json(response, 403, { error: 'Your verified ballot is not available for this election.' })
      return
    }
    if (!Array.isArray(body.selections)) {
      json(response, 400, { error: 'Review every position before submitting your ballot.' })
      return
    }
    const selections = new Map(body.selections.map((selection) => [selection.positionId, selection.candidateIds]))
    if (election.positions.some((position) => !selections.has(position.id))) {
      json(response, 400, { error: 'Choose a candidate or abstain for every position.' })
      return
    }
    for (const position of election.positions) {
      const candidateIds = selections.get(position.id)
      if (!Array.isArray(candidateIds) || candidateIds.length > position.maxVotes ||
          new Set(candidateIds).size !== candidateIds.length) {
        json(response, 400, { error: `Select up to ${position.maxVotes} candidate${position.maxVotes === 1 ? '' : 's'} for ${position.title}.` })
        return
      }
      if (candidateIds.length && candidateIds.some((candidateId) =>
        !position.candidates.some((candidate) => candidate.id === candidateId && candidate.active))) {
        json(response, 400, { error: `One or more selections for ${position.title} are unavailable.` })
        return
      }
    }
    db.exec('BEGIN IMMEDIATE')
    try {
      const currentEligibility = voterStatus(election.id, user.id)
      if (electionState(db.prepare('SELECT * FROM elections WHERE id = ?').get(election.id)) !== 'open' ||
          currentEligibility?.status !== 'verified') {
        db.exec('ROLLBACK')
        json(response, 409, { error: 'Your voting status changed before the ballot was recorded. Refresh and check your election status.' })
        return
      }
      const ballotId = id()
      const receiptCode = `EB-${randomBytes(6).toString('hex').toUpperCase()}`
      db.prepare('INSERT INTO ballots (id, election_id, receipt_code, submitted_at) VALUES (?, ?, ?, ?)')
        .run(ballotId, election.id, receiptCode, now())
      const insertItem = db.prepare('INSERT INTO ballot_items (id, ballot_id, position_id, candidate_id) VALUES (?, ?, ?, ?)')
      for (const position of election.positions) {
        const candidateIds = selections.get(position.id)
        if (candidateIds.length) {
          for (const candidateId of candidateIds) insertItem.run(id(), ballotId, position.id, candidateId)
        } else {
          insertItem.run(id(), ballotId, position.id, null)
        }
      }
      db.prepare('INSERT INTO ballot_seals (ballot_id) VALUES (?)').run(ballotId)
      const changed = db.prepare(`UPDATE voter_eligibility SET status = 'voted'
        WHERE election_id = ? AND student_id = ? AND status = 'verified'`).run(election.id, user.id)
      if (changed.changes !== 1) throw new Error('Voting eligibility changed during submission.')
      db.exec('COMMIT')
      json(response, 201, { receiptCode, submittedAt: now() })
    } catch (error) {
      db.exec('ROLLBACK')
      if (String(error.message).includes('UNIQUE constraint')) {
        json(response, 409, { error: 'A ballot has already been recorded for your account.' })
        return
      }
      throw error
    }
    return
  }

  const resultsMatch = pathname.match(/^\/api\/elections\/([^/]+)\/results$/)
  if (method === 'GET' && resultsMatch) {
    const user = requireUser(request, response)
    if (!user) return
    const election = getElection(resultsMatch[1])
    if (!election) {
      json(response, 404, { error: 'Election not found.' })
      return
    }
    const state = electionState(election)
    if (user.role !== 'admin' && state !== 'published' && !election.public_results) {
      if (state !== 'open' || election.results_policy === 'hidden') {
        json(response, 403, { error: 'Results will be available after the committee publishes them.' })
        return
      }
      if (election.results_policy === 'turnout_only') {
        const totalBallots = db.prepare('SELECT COUNT(*) AS count FROM ballots WHERE election_id = ?').get(election.id).count
        const eligibleCount = db.prepare('SELECT COUNT(*) AS count FROM voter_eligibility WHERE election_id = ?').get(election.id).count
        json(response, 200, { results: {
          election: { id: election.id, title: election.title, academicYear: election.academic_year, status: state },
          totalBallots,
          eligibleCount,
          turnout: eligibleCount ? Math.round((totalBallots / eligibleCount) * 100) : 0,
          positions: [],
        } })
        return
      }
    }
    json(response, 200, { results: electionResults(election.id) })
    return
  }

  const exportMatch = pathname.match(/^\/api\/elections\/([^/]+)\/results\/export$/)
  if (method === 'GET' && exportMatch) {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const results = electionResults(exportMatch[1])
    if (!results) {
      json(response, 404, { error: 'Election not found.' })
      return
    }
    const rows = [['Election', results.election.title], ['Academic year', results.election.academicYear], ['Eligible voters', results.eligibleCount], ['Ballots cast', results.totalBallots], ['Turnout', `${results.turnout}%`], [], ['Turnout by college/program'], ['College', 'Program', 'Eligible', 'Ballots cast', 'Turnout']]
    for (const group of results.turnoutByProgram) rows.push([group.college, group.program, group.eligible, group.voted, `${group.eligible ? Math.round((group.voted / group.eligible) * 100) : 0}%`])
    rows.push([], ['Position', 'Candidate', 'Partylist', 'Votes', 'Percent', 'Abstentions', 'Winner', 'Tie'])
    for (const position of results.positions) {
      for (const candidate of position.candidates) rows.push([position.title, candidate.name, candidate.partylist || 'Independent', candidate.votes, `${candidate.percentage}%`, position.abstainCount, candidate.id === position.winnerId ? 'Yes' : '', position.tie ? 'Yes' : ''])
    }
    const csv = rows.map((row) => row.map((field) => `"${String(field ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
    json(response, 200, { csv, filename: `eboto-results-${exportMatch[1]}.csv` })
    return
  }

  if (method === 'GET' && pathname === '/api/admin/audit') {
    const user = requireUser(request, response, 'admin')
    if (!user) return
    const rows = db.prepare(`SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId,
      a.metadata, a.created_at AS createdAt, u.name AS actor
      FROM audit_logs a JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 200`).all()
    json(response, 200, { entries: rows.map((row) => ({ ...row, metadata: JSON.parse(row.metadata) })) })
    return
  }

  if (method === 'GET' && pathname === '/api/health') {
    json(response, 200, { ok: true, service: 'E-BOTO API' })
    return
  }

  json(response, 404, { error: 'This API route was not found.' })
}

function serveStatic(request, response, url) {
  const candidateMatch = url.pathname.match(/^\/uploads\/candidates\/([a-f0-9]{32}\.webp)$/)
  if (candidateMatch) {
    const file = path.join(uploadDirectory, candidateMatch[1])
    if (!existsSync(file)) {
      response.writeHead(404)
      response.end()
      return
    }
    setHeaders(response, 'image/webp')
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    createReadStream(file).pipe(response)
    return
  }

  const distDirectory = path.join(root, 'dist')
  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
  const safePath = path.resolve(distDirectory, `.${requestedPath}`)
  const isAsset = safePath.startsWith(distDirectory) && existsSync(safePath) && statSync(safePath).isFile()
  const file = isAsset ? safePath : path.join(distDirectory, 'index.html')
  if (!existsSync(file)) {
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('E-BOTO frontend is not built yet. Run npm run build first.')
    return
  }
  const type = file.endsWith('.html') ? 'text/html; charset=utf-8'
    : file.endsWith('.css') ? 'text/css; charset=utf-8'
      : file.endsWith('.js') ? 'text/javascript; charset=utf-8'
        : file.endsWith('.svg') ? 'image/svg+xml'
          : file.endsWith('.png') ? 'image/png' : 'application/octet-stream'
  setHeaders(response, type)
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self'; connect-src 'self'")
  response.setHeader('Cache-Control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600')
  createReadStream(file).pipe(response)
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url)
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      serveStatic(request, response, url)
    } else {
      json(response, 405, { error: 'This method is not allowed.' })
    }
  } catch (error) {
    console.error('E-BOTO request failed:', error)
    if (!response.headersSent) json(response, error.status || 500, {
      error: error.status ? error.message : 'Something went wrong. Please try again.',
    })
    else response.end()
  }
})

server.listen(port, host, () => {
  console.log(`E-BOTO API listening at http://${host}:${port}`)
})

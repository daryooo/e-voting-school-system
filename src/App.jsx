import { useEffect, useMemo, useState } from 'react'
import { api, fileAsDataUrl } from './api'

const bannerPath = '/ctu-banner.png'

function Icon({ name, size = 20 }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    ballot: <><path d="M8 5h11v16H5V8z" /><path d="M8 5V3h8v2M8 11h7M8 15h7" /><path d="m8 18 1.5 1.5L12 17" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1zM16 5.2a3 3 0 0 1 0 5.6M18 14a5 5 0 0 1 3 4.5v1.5" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="M8 15v-4h3v4M14 15V7h3v8M20 15V4h2v11" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.7Z" transform="translate(-1 -1)" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    camera: <><path d="M14 5h-4L8 7H4v12h16V7h-4z" /><circle cx="12" cy="13" r="3" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 17v4h14v-4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.info}</svg>
}

function CandidatePortrait({ candidate, large = false }) {
  const initials = (candidate?.name || 'CTU Student').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return (
    <div className={`candidate-portrait${large ? ' candidate-portrait--large' : ''}`}>
      {candidate?.photoUrl
        ? <img src={candidate.photoUrl} alt={`Portrait of ${candidate.name}`} />
        : <span aria-label={`${candidate?.name || 'Candidate'} portrait placeholder`}>{initials}</span>}
    </div>
  )
}

function StatusBadge({ status }) {
  const labels = {
    draft: 'Draft',
    scheduled: 'Scheduled',
    open: 'Voting open',
    closed: 'Closed',
    published: 'Results published',
    not_verified: 'Not verified',
    pending: 'Verification pending',
    verified: 'Verified',
    rejected: 'Action required',
    voted: 'Vote recorded',
  }
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>
}

function BrandLockup({ compact = false }) {
  return (
    <div className={`brand-lockup${compact ? ' brand-lockup--compact' : ''}`}>
      <img className="ctu-banner" src={bannerPath} alt="Cebu Technological University" />
      <div className="brand-wordmark">
        <span className="brand-name">E-BOTO</span>
        <span className="brand-tagline">Electronic Ballot Online for Transparent Outcomes</span>
      </div>
    </div>
  )
}

function LoginScreen({ onLogin, onRegister, busy, registrationBusy, error }) {
  const [role, setRole] = useState('student')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [registrationError, setRegistrationError] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [name, setName] = useState('')
  const [college, setCollege] = useState('')
  const [program, setProgram] = useState('')
  const [yearLevel, setYearLevel] = useState('')
  const [registrationPassword, setRegistrationPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  function fillDemo(kind) {
    setRole(kind)
    setCreatingAccount(false)
    setLogin(kind === 'admin' ? 'admin@ctu.edu.ph' : '2026-0001')
    setPassword(kind === 'admin' ? 'CtuAdmin!2026' : 'CtuStudent!2026')
  }

  function submit(event) {
    event.preventDefault()
    setRegistrationError('')
    if (creatingAccount) {
      if (registrationPassword !== confirmPassword) {
        setRegistrationError('Your passwords do not match.')
        return
      }
      onRegister({ studentNumber, name, college, program, yearLevel: Number(yearLevel), password: registrationPassword })
      return
    }
    onLogin({ role, login, password })
  }

  return (
    <main className="login-page">
      <header className="public-masthead">
        <BrandLockup />
        <div className="masthead-caption"><span className="live-dot" /> Official student election portal</div>
      </header>
      <div className="login-layout">
        <section className="login-story">
          <div className="eyebrow"><span className="eyebrow-rule" /> YOUR VOICE, YOUR VOTE</div>
          <h1>Shape the<br /><em>next chapter.</em></h1>
          <p>Every vote moves our community forward. Choose the student leaders who will bring your ideas to life.</p>
          <div className="login-story-meta">
            <div className="story-seal"><span>CTU</span><small>MAIN CAMPUS</small></div>
            <span>Secure. Private. For every CTU student.</span>
          </div>
          <div className="hero-orbit hero-orbit--one" />
          <div className="hero-orbit hero-orbit--two" />
          <div className="hero-ballot-card">
            <div className="ballot-card-top"><span className="mini-seal">C</span><span>STUDENT ELECTIONS</span><span className="live-chip"><i /> LIVE</span></div>
            <div className="ballot-card-lines"><b /><i /><i /></div>
            <div className="ballot-card-check"><Icon name="check" size={18} /></div>
          </div>
        </section>
        <section className="login-card">
          <div className="login-card-heading">
            <span className="login-icon"><Icon name="shield" size={22} /></span>
            <div><h2>{creatingAccount ? 'Join E-BOTO' : 'Welcome to E-BOTO'}</h2><p>{creatingAccount ? 'Create your student account to get started.' : 'Sign in to continue to your portal.'}</p></div>
          </div>
          <div className="role-picker" aria-label="Choose account type" role="tablist">
            <button type="button" className={role === 'student' ? 'selected' : ''} onClick={() => setRole('student')} role="tab" aria-selected={role === 'student'}>Student</button>
            <button type="button" className={role === 'admin' ? 'selected' : ''} onClick={() => { setRole('admin'); setCreatingAccount(false); setRegistrationError('') }} role="tab" aria-selected={role === 'admin'}>Admin</button>
          </div>
          <form onSubmit={submit} className="login-form">
            {creatingAccount ? <>
              <label htmlFor="register-name">Full name</label>
              <input id="register-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="As shown on your student ID" maxLength="100" required />
              <label htmlFor="register-id">Student ID</label>
              <input id="register-id" autoComplete="username" value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} placeholder="e.g. 2026-0001" maxLength="32" required />
              <div className="registration-fields">
                <label htmlFor="register-college">College<input id="register-college" value={college} onChange={(event) => setCollege(event.target.value)} placeholder="Your college" maxLength="120" required /></label>
                <label htmlFor="register-program">Program<input id="register-program" value={program} onChange={(event) => setProgram(event.target.value)} placeholder="Your program" maxLength="120" required /></label>
              </div>
              <label htmlFor="register-year">Year level</label>
              <select id="register-year" value={yearLevel} onChange={(event) => setYearLevel(event.target.value)} required><option value="" disabled>Select your year level</option>{[1, 2, 3, 4, 5, 6].map((year) => <option key={year} value={year}>Year {year}</option>)}</select>
              <label htmlFor="register-password">Password</label>
              <input id="register-password" type="password" autoComplete="new-password" value={registrationPassword} onChange={(event) => setRegistrationPassword(event.target.value)} placeholder="At least 10 characters" minLength="10" maxLength="128" required />
              <label htmlFor="register-confirm">Confirm password</label>
              <input id="register-confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" minLength="10" maxLength="128" required />
            </> : <>
              <label htmlFor="login-id">{role === 'student' ? 'Student ID' : 'Admin email'}</label>
              <input id="login-id" autoComplete={role === 'student' ? 'username' : 'email'} value={login} onChange={(event) => setLogin(event.target.value)} placeholder={role === 'student' ? 'e.g. 2026-0001' : 'name@ctu.edu.ph'} required />
              <label htmlFor="login-password">Password</label>
              <div className="password-wrap">
                <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
            </>}
            {(registrationError || error) && <div className="form-alert" role="alert">{registrationError || error}</div>}
            <button className="button button-primary login-submit" disabled={creatingAccount ? registrationBusy : busy}>{(creatingAccount ? registrationBusy : busy) ? <span className="button-spinner" /> : <>{creatingAccount ? 'Create student account' : 'Sign in securely'} <Icon name="arrow" size={18} /></>}</button>
          </form>
          {role === 'student' && <p className="account-switch">{creatingAccount ? 'Already have an account?' : 'New to E-BOTO?'} <button type="button" onClick={() => { setCreatingAccount((value) => !value); setRegistrationError('') }}>{creatingAccount ? 'Sign in' : 'Create a student account'}</button></p>}
          {!creatingAccount && <div className="demo-access">
            <span>DEMO ACCESS</span>
            <button type="button" onClick={() => fillDemo('student')}>Student demo <Icon name="arrow" size={14} /></button>
            <button type="button" onClick={() => fillDemo('admin')}>Admin demo <Icon name="arrow" size={14} /></button>
          </div>}
          {creatingAccount && <p className="registration-note"><Icon name="info" size={15} /> Creating an account doesn’t add you to an election. You must be on its voter list and verified before voting.</p>}
          <p className="privacy-note"><Icon name="shield" size={15} /> Your identity is never linked to your ballot choices.</p>
        </section>
      </div>
      <footer className="public-footer"><span>© Cebu Technological University · Main Campus</span><span>Built for a fairer, more connected campus.</span></footer>
    </main>
  )
}

function StatCard({ icon, label, value, note, accent }) {
  return (
    <article className={`stat-card${accent ? ' stat-card--accent' : ''}`}>
      <span className="stat-icon"><Icon name={icon} size={19} /></span>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function EmptyState({ icon = 'ballot', title, message, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={25} /></span><h3>{title}</h3><p>{message}</p>{action}</div>
}

function CandidateProfile({ candidate, position, onClose }) {
  if (!candidate) return null
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close candidate profile"><Icon name="close" /></button>
        <div className="profile-cover"><span className="eyebrow">CANDIDATE PROFILE · {position}</span><CandidatePortrait candidate={candidate} large /></div>
        <div className="profile-content"><span className="party-label">{candidate.partylist || 'Independent'}</span><h2 id="profile-title">{candidate.name}</h2><p className="profile-academic">{candidate.college} · {candidate.program} · Year {candidate.yearLevel}</p>
          {candidate.bio && <div className="profile-section"><h3>About</h3><p>{candidate.bio}</p></div>}
          {candidate.platform && <div className="profile-section"><h3>Platform & advocacies</h3><p>{candidate.platform}</p></div>}
          {candidate.achievements && <div className="profile-section"><h3>Achievements & organizations</h3><p>{candidate.achievements}</p></div>}
          <button type="button" className="button button-secondary full-width" onClick={onClose}>Back to ballot</button>
        </div>
      </section>
    </div>
  )
}

function ConfirmationModal({ title, message, confirmLabel, onCancel, onConfirm, busy }) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <span className="confirm-icon"><Icon name="info" size={23} /></span>
        <h2 id="confirm-title">{title}</h2><p>{message}</p>
        <div className="confirm-actions"><button type="button" className="button button-secondary" onClick={onCancel} disabled={busy}>Go back</button><button type="button" className="button button-primary" onClick={onConfirm} disabled={busy}>{busy ? 'Recording…' : confirmLabel}</button></div>
      </section>
    </div>
  )
}

function newCandidate() {
  return { name: '', partylist: '', college: '', program: '', yearLevel: '', bio: '', platform: '', achievements: '', photoFile: null, photoPreview: '' }
}

function newPosition() {
  return { title: '', seats: 1, maxVotes: 1, candidates: [newCandidate()] }
}

function manilaInput(hoursAhead) {
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000 + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

function manilaInputFromDate(value) {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

function CreateElectionModal({ onClose, onCreate, busy, error, initialElection }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => initialElection ? {
    electionId: initialElection.id,
    title: initialElection.title,
    description: initialElection.description,
    electionType: initialElection.election_type,
    academicYear: initialElection.academic_year,
    startLocal: manilaInputFromDate(initialElection.start_at),
    endLocal: manilaInputFromDate(initialElection.end_at),
    resultsPolicy: initialElection.results_policy,
    positions: initialElection.positions.map((position) => ({
      title: position.title,
      seats: position.seats,
      maxVotes: position.maxVotes,
      candidates: position.candidates.map((candidate) => ({
        ...candidate,
        active: Boolean(candidate.active),
        photoFile: null,
        photoPreview: candidate.photoUrl || '',
        deactivationReason: candidate.deactivationReason || '',
      })),
    })),
    csvFile: null,
  } : {
    title: '', description: '', electionType: 'Student Government', academicYear: '2026–2027',
    startLocal: manilaInput(24), endLocal: manilaInput(48), resultsPolicy: 'hidden',
    positions: [newPosition()], csvFile: null,
  })

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updatePosition(positionIndex, key, value) {
    setForm((current) => ({ ...current, positions: current.positions.map((position, index) => index === positionIndex ? { ...position, [key]: value } : position) }))
  }

  function updateCandidate(positionIndex, candidateIndex, key, value) {
    setForm((current) => ({
      ...current,
      positions: current.positions.map((position, index) => index !== positionIndex ? position : {
        ...position,
        candidates: position.candidates.map((candidate, candidateIndexValue) => candidateIndexValue === candidateIndex ? { ...candidate, [key]: value } : candidate),
      }),
    }))
  }

  function selectPhoto(positionIndex, candidateIndex, file) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      updateCandidate(positionIndex, candidateIndex, 'photoError', 'Choose a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      updateCandidate(positionIndex, candidateIndex, 'photoError', 'Images must be 2 MB or smaller.')
      return
    }
    updateCandidate(positionIndex, candidateIndex, 'photoError', '')
    updateCandidate(positionIndex, candidateIndex, 'photoFile', file)
    updateCandidate(positionIndex, candidateIndex, 'photoPreview', URL.createObjectURL(file))
  }

  function validateStep(stepToValidate = step) {
    if (stepToValidate === 0) {
      if (!form.title.trim() || !form.academicYear.trim()) return 'Add an election title and academic year.'
      if (!form.startLocal || !form.endLocal || new Date(`${form.endLocal}:00+08:00`) <= new Date(`${form.startLocal}:00+08:00`)) return 'Choose an end time after the start time.'
    }
    if (stepToValidate === 1) {
      if (!form.positions.length || form.positions.some((position) => !position.title.trim() || !position.candidates.length)) return 'Add a title, then at least one candidate for every position.'
      const missing = form.positions.some((position) => position.candidates.some((candidate) =>
        !candidate.name.trim() || !candidate.college.trim() || !candidate.program.trim() || !candidate.yearLevel || !(candidate.photoFile || candidate.photoUrl) || (candidate.id && candidate.active === false && !candidate.deactivationReason?.trim())))
      if (missing) return 'Complete each candidate’s profile and add a photo (JPG, PNG, or WebP, max 2 MB).'
      if (form.positions.some((position) => position.candidates.some((candidate) => candidate.photoError))) return 'Replace the invalid candidate photo before continuing.'
    }
    return ''
  }

  function nextStep() {
    const problem = validateStep()
    if (problem) {
      updateForm('validationError', problem)
      return
    }
    updateForm('validationError', '')
    setStep((current) => Math.min(2, current + 1))
  }

  async function submit(publish) {
    const problem = validateStep(0) || validateStep(1)
    if (problem) {
      updateForm('validationError', problem)
      setStep(validateStep(0) ? 0 : 1)
      return
    }
    onCreate({
      ...form,
      startAt: new Date(`${form.startLocal}:00+08:00`).toISOString(),
      endAt: new Date(`${form.endLocal}:00+08:00`).toISOString(),
      publish,
      csvText: form.csvFile,
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <header className="create-modal-header"><div><span className="eyebrow">ELECTION SETUP · ASIA/MANILA</span><h2 id="create-title">{initialElection ? 'Edit draft election' : 'Create an election'}</h2></div><button className="modal-close" type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
        <div className="stepper" aria-label="Creation steps">{['Election details', 'Positions & candidates', 'Voter list & review'].map((label, index) => <div key={label} className={`stepper-item${step === index ? ' current' : ''}${step > index ? ' done' : ''}`}><span>{step > index ? <Icon name="check" size={14} /> : index + 1}</span><small>{label}</small></div>)}</div>
        <div className="create-modal-body">
          {step === 0 && <div className="form-grid">
            <label className="field field--wide">Election title<input value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="e.g. Student Government Election 2026" maxLength={120} /></label>
            <label className="field">Election type<select value={form.electionType} onChange={(event) => updateForm('electionType', event.target.value)}><option>Student Government</option><option>College Council</option><option>Organization</option></select></label>
            <label className="field">Academic year / semester<input value={form.academicYear} onChange={(event) => updateForm('academicYear', event.target.value)} placeholder="2026–2027, 1st semester" maxLength={60} /></label>
            <label className="field field--wide">Description<textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Tell students what this election is for." rows="3" maxLength={500} /></label>
            <label className="field">Voting opens<input type="datetime-local" value={form.startLocal} onChange={(event) => updateForm('startLocal', event.target.value)} /></label>
            <label className="field">Voting closes<input type="datetime-local" value={form.endLocal} onChange={(event) => updateForm('endLocal', event.target.value)} /></label>
            <label className="field field--wide">Results policy<select value={form.resultsPolicy} onChange={(event) => updateForm('resultsPolicy', event.target.value)}><option value="hidden">Hidden until the committee publishes results</option><option value="turnout_only">Show turnout only while voting is open</option><option value="live">Show live results while voting is open</option></select></label>
          </div>}
          {step === 1 && <div className="position-builder">
            {form.positions.map((position, positionIndex) => <section className="builder-position" key={positionIndex}>
              <div className="builder-position-heading"><div><span className="builder-index">POSITION {String(positionIndex + 1).padStart(2, '0')}</span><h3>Ballot position</h3></div>{form.positions.length > 1 && <button className="text-button text-danger" type="button" onClick={() => updateForm('positions', form.positions.filter((_, index) => index !== positionIndex))}>Remove</button>}</div>
              <div className="form-grid form-grid--compact">
                <label className="field field--wide">Position title<input value={position.title} onChange={(event) => updatePosition(positionIndex, 'title', event.target.value)} placeholder="e.g. President" /></label>
                <label className="field">Number of winners<input type="number" min="1" max="20" value={position.seats} onChange={(event) => updatePosition(positionIndex, 'seats', event.target.value)} /></label>
                <label className="field">Max selections per voter<input type="number" min="1" max="20" value={position.maxVotes} onChange={(event) => updatePosition(positionIndex, 'maxVotes', event.target.value)} /></label>
              </div>
              {position.candidates.map((candidate, candidateIndex) => <div className={`candidate-builder${candidate.active === false ? ' candidate-builder--inactive' : ''}`} key={candidate.id || candidateIndex}>
                <div className="candidate-builder-head"><strong>Candidate {candidateIndex + 1}{candidate.active === false && <span className="inactive-label"> · DEACTIVATED</span>}</strong>{candidate.id ? candidate.active === false ? <button className="text-button" type="button" onClick={() => { updateCandidate(positionIndex, candidateIndex, 'active', true); updateCandidate(positionIndex, candidateIndex, 'deactivationReason', '') }}>Restore</button> : <button className="text-button text-danger" type="button" onClick={() => updateCandidate(positionIndex, candidateIndex, 'active', false)}>Deactivate</button> : position.candidates.length > 1 && <button className="text-button text-danger" type="button" onClick={() => updatePosition(positionIndex, 'candidates', position.candidates.filter((_, index) => index !== candidateIndex))}>Remove</button>}</div>
                <div className="candidate-builder-layout">
                  <label className="photo-upload">
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectPhoto(positionIndex, candidateIndex, event.target.files?.[0])} />
                    {candidate.photoPreview ? <img src={candidate.photoPreview} alt={`Preview of ${candidate.name || 'candidate photo'}`} /> : <span><Icon name="camera" size={24} /><small>Add photo</small><i>Square crop · max 2 MB</i></span>}
                  </label>
                  <div className="form-grid form-grid--compact">
                    <label className="field">Full name<input value={candidate.name} onChange={(event) => updateCandidate(positionIndex, candidateIndex, 'name', event.target.value)} placeholder="Candidate's full name" maxLength={100} /></label>
                    <label className="field">Partylist / party <span className="field-optional">optional</span><input value={candidate.partylist} onChange={(event) => updateCandidate(positionIndex, candidateIndex, 'partylist', event.target.value)} placeholder="Independent" maxLength={100} /></label>
                    <label className="field">College<input value={candidate.college} onChange={(event) => updateCandidate(positionIndex, candidateIndex, 'college', event.target.value)} placeholder="College" maxLength={120} /></label>
                    <label className="field">Program<input value={candidate.program} onChange={(event) => updateCandidate(positionIndex, candidateIndex, 'program', event.target.value)} placeholder="Degree program" maxLength={120} /></label>
                    <label className="field">Year level<input type="number" min="1" max="6" value={candidate.yearLevel} onChange={(event) => updateCandidate(positionIndex, candidateIndex, 'yearLevel', event.target.value)} placeholder="1–6" /></label>
                    <label className="field">Short bio <span className="field-optional">optional · 300 chars</span><input value={candidate.bio} onChange={(event) => updateCandidate(positionIndex, candidateIndex, 'bio', event.target.value)} maxLength={300} placeholder="A short introduction" /></label>
                    <label className="field field--wide">Platform & advocacies <span className="field-optional">optional · 1,000 chars</span><textarea rows="2" maxLength={1000} value={candidate.platform} onChange={(event) => updateCandidate(positionIndex, candidateIndex, 'platform', event.target.value)} placeholder="What will this candidate work on?" /></label>
                    <label className="field field--wide">Achievements & organizations <span className="field-optional">optional</span><input value={candidate.achievements || ''} onChange={(event) => updateCandidate(positionIndex, candidateIndex, 'achievements', event.target.value)} placeholder="Relevant student leadership experience" /></label>
                    {candidate.id && candidate.active === false && <label className="field field--wide">Reason for deactivation<input value={candidate.deactivationReason || ''} onChange={(event) => updateCandidate(positionIndex, candidateIndex, 'deactivationReason', event.target.value)} placeholder="Required for the audit log" /></label>}
                    {candidate.photoError && <p className="inline-error field--wide">{candidate.photoError}</p>}
                  </div>
                </div>
              </div>)}
              <button className="add-link" type="button" onClick={() => updatePosition(positionIndex, 'candidates', [...position.candidates, newCandidate()])}><Icon name="plus" size={16} /> Add another candidate</button>
            </section>)}
            <button className="button button-secondary add-position" type="button" onClick={() => updateForm('positions', [...form.positions, newPosition()])}><Icon name="plus" size={17} /> Add a position</button>
          </div>}
          {step === 2 && <div className="review-step">
            <section className="csv-upload-card"><div className="csv-icon"><Icon name="users" size={22} /></div><div><h3>Eligible student list</h3><p>{initialElection ? <>This draft’s voter roll is preserved. Add more students later from <strong>Voters & verification</strong>.</> : <>Upload a CSV with a <code>student_id</code> column. IDs must match active student accounts. You can also add the voter list later.</>}</p>{!initialElection && <><label className="button button-secondary file-button">Choose voter CSV<input type="file" accept=".csv,text/csv" onChange={(event) => updateForm('csvFile', event.target.files?.[0] || null)} /></label>{form.csvFile && <span className="file-selected"><Icon name="check" size={15} /> {form.csvFile.name}</span>}</>}</div></section>
            <section className="review-summary"><span className="eyebrow">READY TO SAVE</span><h3>{form.title || 'Untitled election'}</h3><p>{form.electionType} · {form.academicYear}</p><div className="review-summary-grid"><div><b>{form.positions.length}</b><span>Positions</span></div><div><b>{form.positions.reduce((count, position) => count + position.candidates.length, 0)}</b><span>Candidates</span></div><div><b>{form.csvFile ? 'CSV ready' : 'Not added'}</b><span>Voter list</span></div></div></section>
            <div className="privacy-callout"><Icon name="shield" size={18} /><p><strong>Private by design.</strong> Voter eligibility and anonymous ballot choices are stored separately and never linked.</p></div>
          </div>}
          {(form.validationError || error) && <div className="form-alert" role="alert">{form.validationError || error}</div>}
        </div>
        <footer className="create-modal-footer">
          <button type="button" className="button button-secondary" onClick={step ? () => setStep((current) => current - 1) : onClose}>{step ? 'Back' : 'Cancel'}</button>
          {step < 2 ? <button type="button" className="button button-primary" onClick={nextStep}>Continue <Icon name="arrow" size={17} /></button>
            : <div className="create-final-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => submit(false)}>{initialElection ? 'Save changes' : 'Save draft'}</button><button type="button" className="button button-primary" disabled={busy} onClick={() => submit(true)}>{busy ? 'Saving…' : 'Publish election'} <Icon name="arrow" size={17} /></button></div>}
        </footer>
      </section>
    </div>
  )
}

function ElectionCard({ election, admin, onOpen, onCloseElection, onExtendElection, onPublishResults, onDuplicate, onViewResults }) {
  const positions = election.positions?.length || 0
  const candidates = election.positions?.reduce((count, position) => count + (position.candidates?.length || 0), 0) || 0
  return (
    <article className="election-card">
      <div className="election-card-top"><StatusBadge status={election.status} /><span className="election-year">{election.academic_year}</span></div>
      <h3>{election.title}</h3><p className="election-description">{election.description || 'Student leadership, chosen by students.'}</p>
      <div className="election-card-stats"><span><Icon name="ballot" size={15} /> {positions} positions</span><span><Icon name="users" size={15} /> {admin ? `${election.eligibleCount || 0} eligible` : `${election.eligibility?.status === 'verified' ? 'Ready to vote' : 'Your status'}`}</span><span><Icon name="clock" size={15} /> {candidates} candidates</span></div>
      {admin && <div className="election-timeline"><span>Voting opens</span><strong>{new Date(election.start_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })}</strong><span>Voting closes</span><strong>{new Date(election.end_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })}</strong></div>}
      <div className="election-card-actions">
        {admin ? <>
          {election.status === 'draft' && <button className="button button-primary button-small" onClick={() => onOpen(election)}>Review & edit <Icon name="arrow" size={15} /></button>}
          {['open', 'scheduled'].includes(election.status) && <><button className="button button-secondary button-small" onClick={() => onExtendElection(election)}>Extend</button><button className="button button-secondary button-small" onClick={() => onCloseElection(election)}>Close election</button></>}
          {election.status === 'closed' && <button className="button button-primary button-small" onClick={() => onPublishResults(election)}>Publish results <Icon name="arrow" size={15} /></button>}
          {election.status === 'published' && <button className="button button-secondary button-small" onClick={() => onViewResults(election)}>View results <Icon name="arrow" size={15} /></button>}
          <button className="icon-button" aria-label={`Duplicate ${election.title}`} title="Duplicate as a template" onClick={() => onDuplicate(election)}><Icon name="ballot" size={17} /></button>
        </> : <>
          {election.eligibility?.status === 'verified' && election.status === 'open' && <button className="button button-primary button-small" onClick={() => onOpen(election)}>Open ballot <Icon name="arrow" size={15} /></button>}
          {election.status === 'published' && <button className="button button-secondary button-small" onClick={() => onViewResults(election)}>View results <Icon name="arrow" size={15} /></button>}
          {election.eligibility?.status === 'voted' && <span className="vote-recorded-note"><Icon name="check" size={15} /> Your vote is recorded</span>}
        </>}
      </div>
    </article>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [student, setStudent] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [loginBusy, setLoginBusy] = useState(false)
  const [registrationBusy, setRegistrationBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [toast, setToast] = useState('')
  const [activeNav, setActiveNav] = useState('dashboard')
  const [overview, setOverview] = useState(null)
  const [elections, setElections] = useState([])
  const [queue, setQueue] = useState([])
  const [queueElection, setQueueElection] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editingElection, setEditingElection] = useState(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [ballot, setBallot] = useState(null)
  const [ballotSelections, setBallotSelections] = useState({})
  const [ballotStep, setBallotStep] = useState(0)
  const [ballotReview, setBallotReview] = useState(false)
  const [ballotConfirm, setBallotConfirm] = useState(false)
  const [ballotBusy, setBallotBusy] = useState(false)
  const [ballotReceipt, setBallotReceipt] = useState('')
  const [candidateProfile, setCandidateProfile] = useState(null)
  const [results, setResults] = useState(null)
  const [resultsElection, setResultsElection] = useState(null)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [queueFilter, setQueueFilter] = useState('all')
  const [queueSearch, setQueueSearch] = useState('')
  const [queueRefreshing, setQueueRefreshing] = useState(false)
  const [voterCsv, setVoterCsv] = useState(null)
  const [voterImportBusy, setVoterImportBusy] = useState(false)
  const [reasonPrompt, setReasonPrompt] = useState(null)

  useEffect(() => {
    api('/me').then(({ user: currentUser, student: currentStudent }) => {
      setUser(currentUser)
      setStudent(currentStudent)
    }).catch(() => {}).finally(() => setSessionLoading(false))
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true
    async function load() {
      try {
        if (user.role === 'admin') {
          const [overviewResponse, electionsResponse] = await Promise.all([api('/admin/overview'), api('/elections')])
          if (!active) return
          setOverview(overviewResponse)
          setElections(electionsResponse.elections)
          const selected = queueElection || electionsResponse.elections.find((election) => election.status !== 'draft')?.id || electionsResponse.elections[0]?.id || ''
          setQueueElection(selected)
          if (selected) {
            const queueResponse = await api(`/admin/verification-queue?electionId=${encodeURIComponent(selected)}`)
            if (active) setQueue(queueResponse.voters)
          } else setQueue([])
        } else {
          const response = await api('/student/elections')
          if (active) setElections(response.elections)
        }
      } catch (error) {
        if (active) setToast(error.message)
      }
    }
    load()
    return () => { active = false }
  }, [user, queueElection])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4400)
    return () => clearTimeout(timer)
  }, [toast])

  async function signIn(credentials) {
    setLoginBusy(true)
    setLoginError('')
    try {
      const response = await api('/auth/login', { method: 'POST', body: credentials })
      const profile = await api('/me')
      setUser(response.user)
      setStudent(profile.student)
      setActiveNav(response.user.role === 'admin' ? 'dashboard' : 'home')
    } catch (error) {
      setLoginError(error.message)
    } finally {
      setLoginBusy(false)
    }
  }

  async function registerStudent(details) {
    setRegistrationBusy(true)
    setLoginError('')
    try {
      const response = await api('/auth/register', { method: 'POST', body: details })
      const profile = await api('/me')
      setUser(response.user)
      setStudent(profile.student)
      setActiveNav('home')
      setToast('Your account is ready. Request verification from an open or scheduled election; an admin must approve your eligibility before you can vote.')
    } catch (error) {
      setLoginError(error.message)
    } finally {
      setRegistrationBusy(false)
    }
  }

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch (error) {
      setToast(error.message)
    } finally {
      setUser(null)
      setStudent(null)
      setOverview(null)
      setElections([])
      setActiveNav('dashboard')
    }
  }

  async function reload() {
    if (!user) return
    if (user.role === 'admin') {
      const [overviewResponse, electionsResponse] = await Promise.all([api('/admin/overview'), api('/elections')])
      setOverview(overviewResponse)
      setElections(electionsResponse.elections)
      if (queueElection) {
        const queueResponse = await api(`/admin/verification-queue?electionId=${encodeURIComponent(queueElection)}`)
        setQueue(queueResponse.voters)
      }
    } else {
      const response = await api('/student/elections')
      setElections(response.elections)
    }
  }

  async function refreshVerificationQueue() {
    if (!queueElection) return
    setQueueRefreshing(true)
    try {
      const response = await api(`/admin/verification-queue?electionId=${encodeURIComponent(queueElection)}`)
      setQueue(response.voters)
      setToast('Verification queue refreshed.')
    } catch (error) {
      setToast(error.message)
    } finally {
      setQueueRefreshing(false)
    }
  }

  async function saveElection(form) {
    setCreateBusy(true)
    setCreateError('')
    try {
      const preparedPositions = []
      for (const position of form.positions) {
        const candidates = []
        for (const candidate of position.candidates) {
          let photoUrl = candidate.photoUrl || ''
          if (candidate.photoFile) {
            const photoData = await fileAsDataUrl(candidate.photoFile)
            const photoResponse = await api('/uploads/candidate-photo', { method: 'POST', body: { dataUrl: photoData } })
            photoUrl = photoResponse.photoUrl
          }
          candidates.push({
            id: candidate.id,
            active: candidate.active !== false,
            deactivationReason: candidate.deactivationReason || '',
            name: candidate.name,
            partylist: candidate.partylist,
            college: candidate.college,
            program: candidate.program,
            yearLevel: candidate.yearLevel,
            bio: candidate.bio,
            platform: candidate.platform,
            achievements: candidate.achievements,
            photoUrl,
          })
        }
        preparedPositions.push({ ...position, candidates })
      }
      const body = {
        publish: form.publish,
        title: form.title,
        description: form.description,
        electionType: form.electionType,
        academicYear: form.academicYear,
        startAt: form.startAt,
        endAt: form.endAt,
        resultsPolicy: form.resultsPolicy,
        positions: preparedPositions,
      }
      if (!form.electionId && form.csvText) body.voterCsv = await form.csvText.text()
      const response = await api(form.electionId ? `/elections/${form.electionId}` : '/elections', {
        method: form.electionId ? 'PUT' : 'POST',
        body,
      })
      if (response.voterImport?.unknown.length) {
        setToast(`Election saved. ${response.voterImport.imported} students added; ${response.voterImport.unknown.length} IDs did not match existing student accounts.`)
      } else {
        setToast(form.publish ? 'Election published and scheduled.' : form.electionId ? 'Draft changes saved.' : 'Election saved as a draft.')
      }
      setCreateOpen(false)
      setEditingElection(null)
      await reload()
    } catch (error) {
      setCreateError(error.message)
    } finally {
      setCreateBusy(false)
    }
  }

  async function closeElection(election) {
    setReasonPrompt({ title: 'Close this election?', message: `This will end voting for “${election.title}”. Add a reason to record this action in the audit log.`, action: 'close', election })
  }

  function extendElection(election) {
    setReasonPrompt({ title: 'Extend voting time?', message: `Choose a new closing time for “${election.title}” and add a reason for the audit log.`, action: 'extend', election })
  }

  function editDraft(election) {
    setEditingElection(election)
    setCreateError('')
    setCreateOpen(true)
  }

  async function publishResults(election) {
    try {
      await api(`/elections/${election.id}/publish-results`, { method: 'POST', body: {} })
      setToast('Results are now available to students.')
      await reload()
    } catch (error) {
      setToast(error.message)
    }
  }

  async function duplicateElection(election) {
    try {
      await api(`/elections/${election.id}/duplicate`, { method: 'POST', body: {} })
      setToast('A new draft has been created from this election.')
      await reload()
    } catch (error) {
      setToast(error.message)
    }
  }

  async function submitReason(reason, endLocal) {
    const prompt = reasonPrompt
    if (prompt?.action !== 'verify' && !reason.trim()) return setToast('Add a reason to continue.')
    if (prompt?.action === 'extend' && !endLocal) return setToast('Choose a new closing time.')
    setReasonPrompt(null)
    if (!prompt) return
    try {
      if (prompt.action === 'close') {
        await api(`/elections/${prompt.election.id}/close`, { method: 'POST', body: { reason } })
      } else if (prompt.action === 'extend') {
        await api(`/elections/${prompt.election.id}/extend`, { method: 'POST', body: { reason, endAt: new Date(`${endLocal}:00+08:00`).toISOString() } })
      } else if (prompt.action === 'verify-reject') {
        await api(`/admin/elections/${prompt.electionId}/voters/${encodeURIComponent(prompt.voter.studentNumber)}/reject`, { method: 'POST', body: { reason } })
      } else if (prompt.action === 'verify') {
        await api(`/admin/elections/${prompt.electionId}/voters/${encodeURIComponent(prompt.voter.studentNumber)}/verify`, { method: 'POST', body: {} })
      }
      setToast(prompt.action === 'close' ? 'Election closed. The action is in the audit log.' : prompt.action === 'extend' ? 'Voting time extended. The action is in the audit log.' : prompt.action === 'verify' ? 'Student verified for this election.' : 'Verification request rejected.')
      await reload()
    } catch (error) {
      setToast(error.message)
    }
  }

  async function requestVerification(election) {
    try {
      await api('/student/verification-request', { method: 'POST', body: { electionId: election.id } })
      setToast('Verification requested. Your request is now in the admin’s verification queue.')
      await reload()
    } catch (error) {
      setToast(error.message)
    }
  }

  async function openBallot(election) {
    try {
      const response = await api(`/elections/${election.id}/ballot`)
      setBallot(response.election)
      setBallotSelections(Object.fromEntries(response.election.positions.map((position) => [position.id, []])))
      setBallotStep(0)
      setBallotReview(false)
      setBallotReceipt('')
      setActiveNav('ballot')
    } catch (error) {
      setToast(error.message)
    }
  }

  async function castBallot() {
    if (!ballot) return
    setBallotBusy(true)
    try {
      const selections = ballot.positions.map((position) => ({
        positionId: position.id,
        candidateIds: ballotSelections[position.id] || [],
      }))
      const response = await api(`/elections/${ballot.id}/ballot`, { method: 'POST', body: { selections } })
      setBallotReceipt(response.receiptCode)
      setBallotConfirm(false)
      setBallotReview(false)
      setToast('')
      await reload()
    } catch (error) {
      setBallotConfirm(false)
      setToast(error.message)
    } finally {
      setBallotBusy(false)
    }
  }

  async function loadResults(election) {
    setResultsLoading(true)
    setResults(null)
    setResultsElection(election)
    try {
      const response = await api(`/elections/${election.id}/results`)
      setResults(response.results)
      setActiveNav('results')
    } catch (error) {
      setToast(error.message)
    } finally {
      setResultsLoading(false)
    }
  }

  async function importVoters(event) {
    event.preventDefault()
    if (!voterCsv || !queueElection) return setToast('Choose a voter CSV and an election first.')
    setVoterImportBusy(true)
    try {
      const csv = await voterCsv.text()
      const response = await api(`/elections/${queueElection}/voters/import`, { method: 'POST', body: { csv } })
      setToast(`${response.imported} eligible student${response.imported === 1 ? '' : 's'} added${response.unknown.length ? ` · ${response.unknown.length} IDs did not match student accounts` : ''}.`)
      setVoterCsv(null)
      event.target.reset()
      await reload()
    } catch (error) {
      setToast(error.message)
    } finally {
      setVoterImportBusy(false)
    }
  }

  async function exportResults(election) {
    try {
      const response = await api(`/elections/${election.id}/results/export`)
      const url = URL.createObjectURL(new Blob([response.csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = response.filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setToast(error.message)
    }
  }

  const selectedQueueElection = elections.find((election) => election.id === queueElection)
  const filteredQueue = useMemo(() => queue.filter((voter) => {
    const matchesStatus = queueFilter === 'all' || voter.status === queueFilter
    const query = queueSearch.trim().toLowerCase()
    const matchesSearch = !query || [voter.name, voter.studentNumber, voter.program, voter.college].some((value) => value?.toLowerCase().includes(query))
    return matchesStatus && matchesSearch
  }), [queue, queueFilter, queueSearch])

  if (sessionLoading) return <div className="initial-loader"><span className="loader-mark">E</span><span>Loading your secure portal…</span></div>
  if (!user) return <LoginScreen onLogin={signIn} onRegister={registerStudent} busy={loginBusy} registrationBusy={registrationBusy} error={loginError} />

  const isAdmin = user.role === 'admin'
  const visibleNav = isAdmin
    ? [{ id: 'dashboard', label: 'Overview', icon: 'home' }, { id: 'elections', label: 'Elections', icon: 'ballot' }, { id: 'voters', label: 'Voters & verification', icon: 'users' }, { id: 'results', label: 'Results', icon: 'chart' }, { id: 'audit', label: 'Audit trail', icon: 'shield' }]
    : [{ id: 'home', label: 'My elections', icon: 'home' }, { id: 'results', label: 'Published results', icon: 'chart' }]

  return (
    <div className={`app-shell${isAdmin ? ' admin-shell' : ' student-shell'}`}>
      <header className="app-topbar">
        <BrandLockup compact />
        <div className="topbar-actions"><div className="secure-label"><Icon name="shield" size={15} /><span>Secure portal</span></div><div className="user-chip"><span className="user-avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><div><strong>{user.name}</strong><small>{isAdmin ? 'Election administrator' : student?.studentNumber || user.login}</small></div></div><button className="logout-button" onClick={signOut} aria-label="Sign out"><Icon name="logout" size={18} /><span>Sign out</span></button></div>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-section-label">{isAdmin ? 'ADMIN CONSOLE' : 'STUDENT PORTAL'}</div>
          <nav aria-label="Main navigation">
            {visibleNav.map((item) => <button key={item.id} className={`nav-item${activeNav === item.id ? ' active' : ''}`} onClick={() => { setActiveNav(item.id); if (item.id !== 'ballot') setBallotReview(false) }}><Icon name={item.icon} size={18} /><span>{item.label}</span>{item.id === 'voters' && queue.filter((voter) => voter.status === 'pending').length > 0 && <b className="nav-count">{queue.filter((voter) => voter.status === 'pending').length}</b>}</button>)}
          </nav>
          <div className="sidebar-bottom"><div className="sidebar-help"><span className="help-mark">?</span><strong>Need help?</strong><small>Contact the CTU election committee.</small></div><div className="sidebar-version">E-BOTO <span>·</span> v1.0</div></div>
        </aside>
        <main className="main-content" id="main-content">
          {isAdmin && activeNav === 'dashboard' && <AdminDashboard overview={overview} elections={elections} onNavigate={setActiveNav} onCreate={() => setCreateOpen(true)} onOpenResults={loadResults} />}
          {isAdmin && activeNav === 'elections' && <section className="page-section"><PageHeading eyebrow="ELECTION CONTROL" title="Elections" subtitle="Create, schedule, and monitor every student election." action={<button className="button button-primary" onClick={() => { setEditingElection(null); setCreateError(''); setCreateOpen(true) }}><Icon name="plus" size={17} /> Create election</button>} /><div className="election-grid">{elections.map((election) => <ElectionCard key={election.id} election={election} admin onOpen={editDraft} onCloseElection={closeElection} onExtendElection={extendElection} onPublishResults={publishResults} onDuplicate={duplicateElection} onViewResults={loadResults} />)}</div>{!elections.length && <EmptyState title="No elections yet" message="Create the first election to begin setting up positions, candidates, and eligible voters." action={<button className="button button-primary" onClick={() => { setEditingElection(null); setCreateOpen(true) }}>Create election</button>} />}</section>}
          {isAdmin && activeNav === 'voters' && <section className="page-section"><PageHeading eyebrow="ELIGIBILITY & INTEGRITY" title="Voters & verification" subtitle="Review student eligibility requests and manage each election’s voter roll." action={<button className="button button-secondary" onClick={refreshVerificationQueue} disabled={queueRefreshing}><Icon name="clock" size={16} /> {queueRefreshing ? 'Refreshing…' : 'Refresh queue'}</button>} />
            <div className="queue-overview"><div><span>Pending review</span><strong>{queue.filter((voter) => voter.status === 'pending').length}</strong></div><div><span>Verified</span><strong>{queue.filter((voter) => voter.status === 'verified' || voter.status === 'voted').length}</strong></div><div><span>Needs attention</span><strong>{queue.filter((voter) => voter.status === 'rejected').length}</strong></div></div>
            <div className="section-toolbar"><label className="field">Election<select value={queueElection} onChange={(event) => setQueueElection(event.target.value)}>{elections.map((election) => <option key={election.id} value={election.id}>{election.title}</option>)}</select></label><label className="queue-search"><span>Search by name, ID, college, or program</span><input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="e.g. 2026-0001 or Information Technology" /></label><div className="filter-pills" aria-label="Filter verification queue">{['all', 'pending', 'verified', 'rejected'].map((filter) => <button key={filter} onClick={() => setQueueFilter(filter)} className={queueFilter === filter ? 'selected' : ''}>{filter === 'all' ? 'All students' : filter}</button>)}</div></div>
            <div className="table-card"><table><thead><tr><th>Student</th><th>Program & college</th><th>Year</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredQueue.map((voter) => <tr key={voter.studentNumber}><td><div className="student-table-name"><span>{voter.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><strong>{voter.name}</strong><small>{voter.studentNumber}</small></div></div></td><td>{voter.program}<small className="table-subtext">{voter.college}</small></td><td>Year {voter.yearLevel}</td><td><StatusBadge status={voter.status} />{voter.rejectReason && <small className="table-subtext">{voter.rejectReason}</small>}</td><td>{['pending', 'not_verified', 'rejected'].includes(voter.status) ? <div className="table-actions"><button className="text-button text-success" onClick={() => setReasonPrompt({ action: 'verify', voter, electionId: queueElection })}>Verify</button><button className="text-button text-danger" onClick={() => setReasonPrompt({ action: 'verify-reject', voter, electionId: queueElection })}>Reject</button></div> : <span className="muted">—</span>}</td></tr>)}</tbody></table>{!filteredQueue.length && <EmptyState icon="users" title="No students in this view" message="Import an eligible voter list or adjust the status filter." />}</div>
            {selectedQueueElection?.status === 'draft' && <form className="import-card" onSubmit={importVoters}><div><span className="import-card-icon"><Icon name="download" /></span><div><h3>Import eligible voters</h3><p>CSV format: <code>student_id</code>. IDs must belong to existing student accounts.</p></div></div><label className="button button-secondary file-button">{voterCsv ? voterCsv.name : 'Choose CSV'}<input type="file" accept=".csv,text/csv" onChange={(event) => setVoterCsv(event.target.files?.[0] || null)} /></label><button className="button button-primary" type="submit" disabled={!voterCsv || voterImportBusy}>{voterImportBusy ? 'Importing…' : 'Import voters'}</button></form>}
          </section>}
          {isAdmin && activeNav === 'results' && <ResultsPage elections={elections} results={results} election={resultsElection} loading={resultsLoading} onLoad={loadResults} onExport={exportResults} />}
          {isAdmin && activeNav === 'audit' && <AuditPage />}
          {!isAdmin && activeNav === 'home' && <StudentHome user={user} student={student} elections={elections} onRequestVerification={requestVerification} onOpenBallot={openBallot} onResults={loadResults} />}
          {!isAdmin && activeNav === 'ballot' && ballotReceipt && <BallotConfirmation receipt={ballotReceipt} election={ballot} onDone={() => { setActiveNav('home'); setBallot(null); setBallotReceipt('') }} />}
          {!isAdmin && activeNav === 'ballot' && !ballotReceipt && ballot && <BallotPage election={ballot} selections={ballotSelections} onSelectionsChange={setBallotSelections} currentStep={ballotStep} onStepChange={setBallotStep} review={ballotReview} onReview={setBallotReview} onSubmit={() => setBallotConfirm(true)} onProfile={(candidate, position) => setCandidateProfile({ candidate, position })} />}
          {!isAdmin && activeNav === 'results' && <ResultsPage elections={elections.filter((election) => election.status === 'published' || (election.status === 'open' && election.results_policy !== 'hidden'))} results={results} election={resultsElection} loading={resultsLoading} onLoad={loadResults} onExport={null} />}
          {!isAdmin && activeNav === 'ballot' && !ballot && !ballotReceipt && <EmptyState title="Your ballot isn’t open" message="Choose an eligible open election from your home screen." action={<button className="button button-primary" onClick={() => setActiveNav('home')}>Back to my elections</button>} />}
        </main>
      </div>
      {createOpen && <CreateElectionModal initialElection={editingElection} onClose={() => { setCreateOpen(false); setEditingElection(null) }} onCreate={saveElection} busy={createBusy} error={createError} />}
      {candidateProfile && <CandidateProfile candidate={candidateProfile.candidate} position={candidateProfile.position} onClose={() => setCandidateProfile(null)} />}
      {ballotConfirm && <ConfirmationModal title="Submit your ballot?" message="Your choices will be recorded once and cannot be changed. Your ballot is anonymous; this receipt will not show who you selected." confirmLabel="Confirm & submit" onCancel={() => setBallotConfirm(false)} onConfirm={castBallot} busy={ballotBusy} />}
      {reasonPrompt && <ReasonModal prompt={reasonPrompt} onCancel={() => setReasonPrompt(null)} onSubmit={submitReason} />}
      {toast && <div className="toast-message" role="status"><span><Icon name="info" size={17} /></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><Icon name="close" size={15} /></button></div>}
    </div>
  )
}

function PageHeading({ eyebrow, title, subtitle, action }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>
}

function AdminDashboard({ overview, elections, onNavigate, onCreate, onOpenResults }) {
  const summary = overview?.summary
  const active = overview?.election
  const recent = overview?.recent || []
  const turnoutRows = overview?.turnout || []
  const highestHour = Math.max(1, ...turnoutRows.map((row) => row.votes))
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }).toUpperCase()
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Manila' }).format(new Date()))
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.'
  return (
    <section className="page-section dashboard-page">
      <PageHeading eyebrow={today} title={greeting} subtitle="Here’s what’s happening across your student elections today." action={<button className="button button-primary" onClick={onCreate}><Icon name="plus" size={17} /> New election</button>} />
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy"><span className="hero-kicker"><span className="live-dot" /> ELECTION CONTROL CENTER</span><h2>Your campus.<br /><em>Your say.</em></h2><p>Build trust in every vote. Set up elections, verify students, and publish results with confidence.</p><button className="button button-gold" onClick={onCreate}>Create an election <Icon name="arrow" size={17} /></button></div>
        <div className="hero-graphic" aria-hidden="true"><div className="graphic-orbit" /><div className="graphic-back-card" /><div className="graphic-vote-card"><div className="graphic-card-seal">CTU</div><div className="graphic-card-label">YOUR BALLOT</div><div className="graphic-choice"><span /><i /></div><div className="graphic-choice graphic-choice--checked"><span /><i><Icon name="check" size={15} /></i></div><div className="graphic-choice"><span /><i /></div><div className="graphic-stamp"><Icon name="shield" size={19} /><span>YOUR VOTE<br />IS PRIVATE</span></div></div><div className="graphic-spark graphic-spark--one" /><div className="graphic-spark graphic-spark--two" /></div>
      </section>
      <div className="stats-grid">
        <StatCard icon="ballot" label="Active elections" value={summary?.activeElections ?? '—'} note="Currently accepting votes" />
        <StatCard icon="clock" label="Upcoming" value={summary?.upcomingElections ?? '—'} note="Scheduled to open" />
        <StatCard icon="users" label="Eligible voters" value={summary?.totalVoters ?? '—'} note={`${summary?.verifiedVoters ?? 0} verified across elections`} />
        <StatCard icon="chart" label="Votes recorded" value={summary?.votesCast ?? '—'} note={`${summary?.turnout ?? 0}% overall turnout`} accent />
      </div>
      <div className="dashboard-columns">
        <section className="surface-card turnout-card"><div className="section-card-heading"><div><span className="eyebrow">TURNOUT MONITOR</span><h2>{active?.title || 'Election activity'}</h2></div>{active && <StatusBadge status={active.status} />}</div>
          <div className="turnout-visual"><div className="turnout-donut" style={{ '--turnout': `${summary?.turnout || 0}%` }}><div><strong>{summary?.turnout || 0}%</strong><small>turnout</small></div></div><div className="turnout-legend"><div><i className="legend-dot legend-dot--maroon" /><span>Votes cast</span><strong>{summary?.votesCast || 0}</strong></div><div><i className="legend-dot legend-dot--gold" /><span>Verified voters</span><strong>{summary?.verifiedVoters || 0}</strong></div><div><i className="legend-dot legend-dot--gray" /><span>Eligible voters</span><strong>{summary?.totalVoters || 0}</strong></div></div></div>
          <div className="turnout-bar-chart" aria-label="Ballots submitted by hour">{turnoutRows.length ? turnoutRows.map((row) => {
            const hour = Number(row.hour)
            const label = `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`
            return <div key={row.hour} className="chart-column" title={`${row.votes} ballot${row.votes === 1 ? '' : 's'} at ${label}`}><span style={{ height: `${Math.max(8, (row.votes / highestHour) * 100)}%` }} /><small>{label}</small></div>
          }) : <span className="chart-empty">No ballots recorded yet</span>}</div><p className="chart-footnote">Live turnout updates as students submit their ballots.</p>
        </section>
        <section className="surface-card quick-actions-card"><div className="section-card-heading"><div><span className="eyebrow">SHORTCUTS</span><h2>Quick actions</h2></div></div><div className="quick-action-list"><button onClick={onCreate}><span className="quick-action-icon"><Icon name="plus" /></span><span><strong>Create election</strong><small>Start a new ballot and invite</small></span><Icon name="arrow" size={16} /></button><button onClick={() => onNavigate('voters')}><span className="quick-action-icon"><Icon name="users" /></span><span><strong>Review students</strong><small>Check eligibility requests</small></span><Icon name="arrow" size={16} /></button><button onClick={() => onNavigate('results')}><span className="quick-action-icon"><Icon name="chart" /></span><span><strong>View results</strong><small>Review a completed election</small></span><Icon name="arrow" size={16} /></button><button onClick={() => onNavigate('audit')}><span className="quick-action-icon"><Icon name="shield" /></span><span><strong>Audit trail</strong><small>See recent secure actions</small></span><Icon name="arrow" size={16} /></button></div></section>
      </div>
      <section className="surface-card recent-elections"><div className="section-card-heading"><div><span className="eyebrow">ELECTIONS</span><h2>Recently managed</h2></div><button className="text-button" onClick={() => onNavigate('elections')}>View all <Icon name="arrow" size={15} /></button></div>
        {elections.slice(0, 3).map((election) => <div className="recent-election-row" key={election.id}><span className="election-row-mark"><Icon name="ballot" size={18} /></span><div><strong>{election.title}</strong><small>{election.academic_year} · {election.positions?.length || 0} positions</small></div><StatusBadge status={election.status} /><span className="recent-votes">{election.votesCast || 0} votes</span>{election.status === 'published' && <button className="icon-button" aria-label="Open results" onClick={() => onOpenResults(election)}><Icon name="arrow" size={17} /></button>}</div>)}
        {!elections.length && <EmptyState title="No elections created" message="Start with a draft, add candidates and voters, then publish when you’re ready." />}
      </section>
      <section className="surface-card activity-card"><div className="section-card-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent activity</h2></div><button className="text-button" onClick={() => onNavigate('audit')}>Open audit trail <Icon name="arrow" size={15} /></button></div>{recent.length ? recent.map((record) => <div className="activity-row" key={record.id}><span className="activity-mark"><Icon name={record.action.includes('voter') ? 'users' : 'ballot'} size={16} /></span><div><strong>{record.action.replaceAll('.', ' ')}</strong><small>{record.actor} · {record.entityType}</small></div><time>{new Date(record.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'short', timeStyle: 'short' })}</time></div>) : <p className="muted">Sensitive actions will appear here.</p>}</section>
    </section>
  )
}

function StudentHome({ user, student, elections, onRequestVerification, onOpenBallot, onResults }) {
  const openCount = elections.filter((election) => election.status === 'open' && election.eligibility?.status === 'verified').length
  return (
    <section className="page-section student-home-page">
      <PageHeading eyebrow="STUDENT VOTER PORTAL" title={<>Welcome, <em>{user.name.split(' ')[0]}.</em></>} subtitle={`${student?.program || 'Cebu Technological University'} · ${student?.college || 'Main Campus'} · Year ${student?.yearLevel || '—'}`} action={<span className="student-id-tag">ID · {student?.studentNumber || user.login}</span>} />
      <section className="student-welcome-card"><div><span className="hero-kicker"><span className="live-dot" /> YOUR CAMPUS, YOUR VOICE</span><h2>One vote can<br /><em>move us forward.</em></h2><p>Request eligibility review for an open or scheduled election. An admin must verify you before you can vote.</p></div><div className="welcome-stats"><div><strong>{elections.length}</strong><span>Available elections</span></div><div><strong>{openCount}</strong><span>Ready to vote</span></div><div className="welcome-seal">CTU<span>MAIN CAMPUS</span></div></div></section>
      <div className="student-content-heading"><div><span className="eyebrow">YOUR BALLOT BOX</span><h2>My elections</h2></div><p>All times shown in Philippine Standard Time.</p></div>
      <div className="election-grid">{elections.map((election) => <StudentElectionCard key={election.id} election={election} onRequestVerification={onRequestVerification} onOpenBallot={onOpenBallot} onResults={onResults} />)}</div>
      {!elections.length && <EmptyState title="No elections available" message="Scheduled or open elections will appear here. Request verification from an election card to ask an admin to review your eligibility." />}
      <div className="privacy-banner"><span><Icon name="shield" size={20} /></span><div><strong>Your vote stays yours.</strong><p>Your identity is used to confirm eligibility and one-time voting. Your ballot choices are stored separately and can’t be traced back to you.</p></div></div>
    </section>
  )
}

function StudentElectionCard({ election, onRequestVerification, onOpenBallot, onResults }) {
  const status = election.eligibility?.status || 'not_verified'
  return <article className="student-election-card">
    <div className="student-election-top"><div className={`election-emblem${election.status === 'open' ? ' election-emblem--active' : ''}`}><Icon name="ballot" size={21} /></div><StatusBadge status={election.status} /></div>
    <span className="eyebrow">{election.election_type} · {election.academic_year}</span><h3>{election.title}</h3><p>{election.description || 'Choose the student leaders who will represent your campus.'}</p>
    <div className="eligibility-row"><span>YOUR ELIGIBILITY</span><StatusBadge status={status} /></div>
    {status === 'rejected' && election.eligibility?.rejectReason && <p className="reject-reason">{election.eligibility.rejectReason}</p>}
    {!election.eligibility && ['scheduled', 'open'].includes(election.status) && <p className="verification-help">Request review here to appear in the admin’s verification queue.</p>}
    <div className="student-election-actions">
      {status === 'verified' && election.status === 'open' && <button className="button button-primary full-width" onClick={() => onOpenBallot(election)}>View candidates & vote <Icon name="arrow" size={17} /></button>}
      {['not_verified', 'rejected'].includes(status) && election.status !== 'closed' && election.status !== 'published' && <button className="button button-secondary full-width" onClick={() => onRequestVerification(election)}>{status === 'rejected' ? 'Request review again' : 'Request verification'} <Icon name="arrow" size={16} /></button>}
      {status === 'pending' && <div className="pending-message"><Icon name="clock" size={17} /> Your request is in the admin’s verification queue.</div>}
      {status === 'voted' && <div className="pending-message pending-message--success"><Icon name="check" size={17} /> Your vote is securely recorded.</div>}
      {election.status === 'published' && <button className="button button-secondary full-width" onClick={() => onResults(election)}>View election results <Icon name="arrow" size={16} /></button>}
      {election.status === 'open' && election.results_policy !== 'hidden' && <button className="button button-secondary full-width" onClick={() => onResults(election)}>{election.results_policy === 'turnout_only' ? 'View live turnout' : 'View live results'} <Icon name="arrow" size={16} /></button>}
      {!['open', 'published'].includes(election.status) && <div className="election-date-note"><Icon name="clock" size={15} /> {election.status === 'scheduled' ? 'Opens' : 'Voting is closed'} {election.status === 'scheduled' && `· ${new Date(election.start_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}`}</div>}
    </div>
  </article>
}

function BallotPage({ election, selections, onSelectionsChange, currentStep, onStepChange, review, onReview, onSubmit, onProfile }) {
  const positions = election.positions.filter((position) => position.candidates.some((candidate) => candidate.active))
  function toggleCandidate(position, candidate) {
    onSelectionsChange((current) => {
      const selected = current[position.id] || []
      const next = selected.includes(candidate.id)
        ? selected.filter((id) => id !== candidate.id)
        : position.maxVotes === 1 ? [candidate.id] : selected.length < position.maxVotes ? [...selected, candidate.id] : selected
      return { ...current, [position.id]: next }
    })
  }
  function abstain(position) {
    onSelectionsChange((current) => ({ ...current, [position.id]: [] }))
  }

  return <section className="page-section ballot-page">
    <div className="ballot-topline"><button className="text-button" onClick={() => { onReview(false); onStepChange(0) }}>← Back to elections</button><span className="secure-label"><Icon name="shield" size={15} /> Anonymous ballot</span></div>
    <div className="ballot-heading"><span className="eyebrow">{election.election_type} · {election.academic_year}</span><h1>{review ? 'Review your ballot' : 'Make your voice count.'}</h1><p>{election.title} · Your choices stay private and cannot be changed after submission.</p></div>
    {!review && <div className="ballot-progress"><span>POSITION {currentStep + 1} OF {positions.length}</span><div>{positions.map((position, index) => <button key={position.id} className={`${index === currentStep ? 'current' : ''}${(selections[position.id] || []).length || currentStep > index ? ' complete' : ''}`} aria-label={`Go to ${position.title}`} onClick={() => onStepChange(index)} />)}</div><span>{Math.round(((currentStep + 1) / positions.length) * 100)}%</span></div>}
    {review ? <section className="review-ballot-card"><div className="review-ballot-header"><span className="review-lock"><Icon name="shield" size={18} /></span><div><h2>Review every choice</h2><p>Go back to change a selection before you submit.</p></div></div>{positions.map((position) => {
      const selected = (selections[position.id] || []).map((id) => position.candidates.find((candidate) => candidate.id === id)).filter(Boolean)
      return <div key={position.id} className="review-choice-row"><div><span className="eyebrow">{position.title}</span><strong>{selected.length ? selected.map((candidate) => candidate.name).join(', ') : 'Abstain'}</strong></div><button className="text-button" onClick={() => { onReview(false); onStepChange(positions.indexOf(position)) }}>Change <Icon name="arrow" size={15} /></button></div>
    })}<div className="review-privacy"><Icon name="info" size={17} /><span>Once submitted, your ballot is final. A receipt code confirms it was recorded without revealing your selections.</span></div><div className="review-actions"><button className="button button-secondary" onClick={() => { onReview(false); onStepChange(positions.length - 1) }}>Back to ballot</button><button className="button button-primary" onClick={onSubmit}>Submit ballot <Icon name="arrow" size={17} /></button></div></section>
      : <div className="ballot-positions">{positions.map((position, index) => <section key={position.id} className={`ballot-position${index === currentStep ? ' ballot-position--current' : ''}`} aria-hidden={window.innerWidth < 760 && index !== currentStep}>
        <div className="position-heading"><div><span className="eyebrow">CHOOSE {position.maxVotes === 1 ? 'ONE' : `UP TO ${position.maxVotes}`}</span><h2>{position.title}</h2></div><span className="selection-counter">{(selections[position.id] || []).length} / {position.maxVotes} selected</span></div>
        <div className="candidate-grid">{position.candidates.filter((candidate) => candidate.active).map((candidate) => {
          const isSelected = (selections[position.id] || []).includes(candidate.id)
          return <article key={candidate.id} className={`candidate-vote-card${isSelected ? ' candidate-vote-card--selected' : ''}`}>
            <button className="candidate-select" onClick={() => toggleCandidate(position, candidate)} aria-pressed={isSelected} aria-label={`${isSelected ? 'Remove' : 'Select'} ${candidate.name}`}>
              <CandidatePortrait candidate={candidate} large />
              <span className="candidate-vote-details"><span className="party-label">{candidate.partylist || 'Independent'}</span><strong>{candidate.name}</strong><small>{candidate.college}</small><small>{candidate.program} · Year {candidate.yearLevel}</small></span>
              <span className="candidate-check"><Icon name="check" size={17} /></span>
            </button>
            <button className="profile-link" onClick={() => onProfile(candidate, position.title)}>View profile <Icon name="arrow" size={14} /></button>
          </article>
        })}</div>
        <button className={`abstain-button${(selections[position.id] || []).length === 0 ? ' selected' : ''}`} onClick={() => abstain(position)}><span className="abstain-radio" /> Abstain from this position</button>
        <div className="ballot-step-actions"><button className="button button-secondary" onClick={() => onStepChange(Math.max(0, currentStep - 1))} disabled={currentStep === 0}>Previous</button>{currentStep < positions.length - 1 ? <button className="button button-primary" onClick={() => onStepChange(currentStep + 1)}>Next position <Icon name="arrow" size={16} /></button> : <button className="button button-primary" onClick={() => onReview(true)}>Review ballot <Icon name="arrow" size={16} /></button>}</div>
      </section>)}</div>}
  </section>
}

function BallotConfirmation({ receipt, election, onDone }) {
  return <section className="receipt-page">
    <div className="receipt-confetti" aria-hidden="true"><span /><span /><span /><span /><span /></div>
    <div className="receipt-icon"><Icon name="check" size={35} /></div><span className="eyebrow">BALLOT SECURELY RECORDED</span><h1>Thank you for<br /><em>showing up.</em></h1><p>Your voice has been counted in <strong>{election?.title}</strong>. You can’t edit or view your choices again.</p>
    <div className="receipt-code-card"><span>PRIVATE RECEIPT CODE</span><strong>{receipt}</strong><small>This code proves your ballot was recorded. It does not reveal who you voted for.</small></div>
    <div className="receipt-privacy"><Icon name="shield" size={17} /> Your identity and your ballot are stored separately.</div><button className="button button-primary" onClick={onDone}>Return to my elections <Icon name="arrow" size={17} /></button>
  </section>
}

function ResultsPage({ elections, results, election, loading, onLoad, onExport }) {
  return <section className="page-section results-page"><div className="print-brand"><BrandLockup /></div><PageHeading eyebrow="TRANSPARENT OUTCOMES" title="Election results" subtitle="Review verified totals and an auditable summary of every published ballot." action={results && <div className="results-actions">{onExport && <button className="button button-secondary" onClick={() => window.print()}><Icon name="download" size={16} /> Print / save PDF</button>}{onExport && <button className="button button-secondary" onClick={() => onExport(election)}><Icon name="download" size={16} /> Export CSV</button>}</div>} />
    <div className="results-toolbar"><label className="field">Choose election<select value={election?.id || ''} onChange={(event) => onLoad(elections.find((item) => item.id === event.target.value))}><option value="" disabled>Select an election</option>{elections.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{election && <StatusBadge status={election.status} />}</div>
    {loading && <div className="results-skeleton">Loading verified results…</div>}
    {results && <>
      <div className="results-overview"><div><span>Voter turnout</span><strong>{results.turnout}%</strong><small>{results.totalBallots} of {results.eligibleCount} eligible students</small></div><div><span>Ballots recorded</span><strong>{results.totalBallots}</strong><small>One anonymous ballot per student</small></div><div><span>Positions</span><strong>{results.positions.length}</strong><small>Results published by the committee</small></div><div className="results-seal">E-BOTO<small>VERIFIED SUMMARY</small></div></div>
      {results.turnoutByProgram?.length > 0 && <section className="turnout-breakdown"><div className="turnout-breakdown-heading"><div><span className="eyebrow">PARTICIPATION</span><h2>Turnout by college &amp; program</h2></div><span>Voted / eligible</span></div><div className="turnout-program-grid">{results.turnoutByProgram.map((group) => { const percent = group.eligible ? Math.round((group.voted / group.eligible) * 100) : 0; return <div className="turnout-program" key={`${group.college}-${group.program}`}><div className="turnout-program-label"><div><strong>{group.program}</strong><small>{group.college}</small></div><span>{group.voted} / {group.eligible} <b>{percent}%</b></span></div><div className="turnout-program-meter" role="progressbar" aria-label={`${group.program} voter turnout`} aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${percent}%` }} /></div></div> })}</div></section>}
      {results.positions.length ? <div className="results-position-grid">{results.positions.map((position) => <article className="result-position-card" key={position.id}><div className="result-position-heading"><div><span className="eyebrow">POSITION</span><h2>{position.title}</h2></div>{position.tie && <span className="tie-badge">Tie · committee review</span>}</div>{position.candidates.map((candidate, index) => <div className={`result-candidate${candidate.id === position.winnerId ? ' result-candidate--winner' : ''}`} key={candidate.id}><span className="result-rank">{String(index + 1).padStart(2, '0')}</span><CandidatePortrait candidate={candidate} /><div className="result-candidate-info"><strong>{candidate.name}</strong><small>{candidate.partylist || 'Independent'}</small><div className="result-meter"><span style={{ width: `${candidate.percentage}%` }} /></div></div><div className="result-count"><strong>{candidate.votes}</strong><small>{candidate.percentage}%</small></div>{candidate.id === position.winnerId && <span className="winner-tag">WINNER</span>}</div>)}<div className="abstain-result"><span>Abstain</span><strong>{position.abstainCount} votes</strong></div></article>)}</div> : <div className="turnout-only-note"><Icon name="chart" size={20} /><div><strong>Turnout only</strong><p>The election committee has chosen to show participation while voting is open. Candidate totals remain private until results are published.</p></div></div>}
      <div className="privacy-banner"><span><Icon name="shield" size={20} /></span><div><strong>Results you can trust.</strong><p>Ballot choices are tallied without linking them to student identities. The audit trail records administrative actions, not how anyone voted.</p></div></div>
    </>}
    {!results && !loading && <EmptyState icon="chart" title="Select a results report" message="Choose a published election to view its verified totals and turnout." />}
  </section>
}

function AuditPage() {
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { api('/admin/audit').then((response) => setEntries(response.entries)).catch((reason) => setError(reason.message)) }, [])
  return <section className="page-section"><PageHeading eyebrow="ACCOUNTABILITY" title="Audit trail" subtitle="A read-only record of the administrative and verification actions that protect each election." />
    {error && <div className="form-alert">{error}</div>}
    <div className="audit-integrity-note"><span><Icon name="shield" size={21} /></span><div><strong>Append-only by design</strong><p>Audit entries cannot be edited or deleted from E-BOTO. Ballot selections are never included in this log.</p></div></div>
    <div className="table-card audit-table"><table><thead><tr><th>Action</th><th>Performed by</th><th>Election / record</th><th>Details</th><th>Date & time</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td><span className="audit-action"><Icon name={entry.action.includes('verify') ? 'users' : 'shield'} size={15} />{entry.action.replaceAll('.', ' ')}</span></td><td>{entry.actor}</td><td>{entry.entityType}<small className="table-subtext">{entry.entityId}</small></td><td>{entry.metadata.reason || entry.metadata.title || entry.metadata.imported !== undefined && `${entry.metadata.imported} imported` || '—'}</td><td>{new Date(entry.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}</td></tr>)}</tbody></table>{!entries.length && <EmptyState icon="shield" title="No actions recorded" message="Election setup, verification decisions, and results publication will appear here." />}</div>
  </section>
}

function ReasonModal({ prompt, onCancel, onSubmit }) {
  const [reason, setReason] = useState('')
  const [endLocal, setEndLocal] = useState(() => prompt.action === 'extend'
    ? new Date(new Date(prompt.election.end_at).getTime() + 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
    : '')
  const [busy, setBusy] = useState(false)
  const isVerify = prompt.action === 'verify'
  const isReject = prompt.action === 'verify-reject'
  const isExtend = prompt.action === 'extend'
  return <div className="modal-backdrop"><form className="confirm-modal reason-modal" onSubmit={async (event) => { event.preventDefault(); setBusy(true); await onSubmit(reason, endLocal); setBusy(false) }}><span className="confirm-icon"><Icon name={isVerify ? 'check' : 'info'} size={23} /></span><h2>{isVerify ? 'Verify this student?' : isReject ? 'Reject verification?' : prompt.title}</h2><p>{isVerify ? `Confirm ${prompt.voter.name} is eligible to vote in this election.` : isReject ? `Add a clear reason so ${prompt.voter.name} knows what to correct.` : prompt.message}</p>{isExtend && <label className="field">New closing time<input type="datetime-local" required min={manilaInputFromDate(prompt.election.end_at)} value={endLocal} onChange={(event) => setEndLocal(event.target.value)} /></label>}{!isVerify && <label className="field">Reason<textarea rows="3" required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isReject ? 'e.g. Student ID details do not match' : 'Required for the audit log'} /></label>}<div className="confirm-actions"><button type="button" className="button button-secondary" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : isVerify ? 'Confirm verification' : isReject ? 'Reject request' : isExtend ? 'Extend voting' : 'Close election'}</button></div></form></div>
}
